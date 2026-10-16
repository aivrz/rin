import Elysia, { t } from "elysia";
import { and, eq } from "drizzle-orm";
import crypto from "node:crypto";
import type { DB } from "../_worker";
import { users, oauthIdentities } from "../db/schema";
import { setup } from "../setup";
import { ServerConfig } from "../utils/cache";

// erphplogin 整合：QQ / 微博 / 微信网页授权 三种 OAuth 登录。
// 微信网页授权（snsapi_userinfo）需要认证「服务号」资质，订阅号无法使用，未具备时该入口置灰。

type Provider = 'qq' | 'weibo' | 'wechat';

const PROVIDERS: Record<Provider, {
    authorize: string;
    token: string;
    openidUrl?: string;
    userInfo: string;
    scope: string;
    clientIdEnv: string;
    secretEnv: string;
    clientIdKey: string;
    secretKey: string;
}> = {
    qq: {
        authorize: 'https://graph.qq.com/oauth2.0/authorize',
        token: 'https://graph.qq.com/oauth2.0/token',
        openidUrl: 'https://graph.qq.com/oauth2.0/me',
        userInfo: 'https://graph.qq.com/user/get_user_info',
        scope: 'get_user_info',
        clientIdEnv: 'QQ_APPID',
        secretEnv: 'QQ_APPKEY',
        clientIdKey: 'qq_appid',
        secretKey: 'qq_appkey',
    },
    weibo: {
        authorize: 'https://api.weibo.com/oauth2/authorize',
        token: 'https://api.weibo.com/oauth2/access_token',
        userInfo: 'https://api.weibo.com/2/users/show.json',
        scope: 'email',
        clientIdEnv: 'WEIBO_APPKEY',
        secretEnv: 'WEIBO_APPSECRET',
        clientIdKey: 'weibo_appkey',
        secretKey: 'weibo_appsecret',
    },
    wechat: {
        authorize: 'https://open.weixin.qq.com/connect/oauth2/authorize',
        token: 'https://api.weixin.qq.com/sns/oauth2/access_token',
        userInfo: 'https://api.weixin.qq.com/sns/userinfo',
        scope: 'snsapi_userinfo',
        clientIdEnv: 'WECHAT_APPID',
        secretEnv: 'WECHAT_APPSECRET',
        clientIdKey: 'wechat_appid',
        secretKey: 'wechat_appsecret',
    },
};

// 凭证读取：后端设置（server 配置）优先，环境变量兜底，兼容旧部署。
async function getCreds(provider: Provider, envObj: any): Promise<{ clientId: string; clientSecret: string }> {
    const cfg = PROVIDERS[provider];
    const clientId = (await ServerConfig().get(cfg.clientIdKey)) || envObj[cfg.clientIdEnv];
    const clientSecret = (await ServerConfig().get(cfg.secretKey)) || envObj[cfg.secretEnv];
    return { clientId, clientSecret };
}

interface OAuthProfile { openid: string; username: string; avatar: string; }

async function exchangeQQ(code: string, appid: string, appkey: string, redirectUri: string): Promise<OAuthProfile> {
    const tokenRes = await fetch(`${PROVIDERS.qq.token}?grant_type=authorization_code&client_id=${appid}&client_secret=${appkey}&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`);
    const tokenParams = new URLSearchParams(await tokenRes.text());
    const accessToken = tokenParams.get('access_token')!;
    const meText = await (await fetch(`${PROVIDERS.qq.openidUrl}?access_token=${accessToken}`)).text();
    const openid = /"openid"\s*:\s*"([^"]+)"/.exec(meText)?.[1] || '';
    const info: any = await (await fetch(`${PROVIDERS.qq.userInfo}?access_token=${accessToken}&oauth_consumer_key=${appid}&openid=${openid}`)).json();
    return { openid, username: info.nickname || ('qq_' + openid.slice(0, 8)), avatar: info.figureurl_qq_2 || info.figureurl_qq_1 || '' };
}

async function exchangeWeibo(code: string, appkey: string, appsecret: string, redirectUri: string): Promise<OAuthProfile> {
    const tokenRes = await fetch(PROVIDERS.weibo.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=authorization_code&client_id=${appkey}&client_secret=${appsecret}&code=${code}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    });
    const token: any = await tokenRes.json();
    const info: any = await (await fetch(`${PROVIDERS.weibo.userInfo}?uid=${token.uid}&access_token=${token.access_token}`)).json();
    return { openid: String(token.uid), username: info.screen_name || ('wb_' + token.uid), avatar: info.avatar_large || info.profile_image_url || '' };
}

async function exchangeWechat(code: string, appid: string, appsecret: string): Promise<OAuthProfile> {
    const token: any = await (await fetch(`${PROVIDERS.wechat.token}?grant_type=authorization_code&appid=${appid}&secret=${appsecret}&code=${code}`)).json();
    const info: any = await (await fetch(`${PROVIDERS.wechat.userInfo}?access_token=${token.access_token}&openid=${token.openid}&lang=zh_CN`)).json();
    return { openid: token.openid, username: info.nickname || ('wx_' + token.openid.slice(0, 8)), avatar: info.headimgurl || '' };
}

async function upsertOAuthUser(db: DB, jwt: any, set: any, provider: Provider, profile: OAuthProfile) {
    let identity = await db.query.oauthIdentities.findFirst({
        where: and(eq(oauthIdentities.provider, provider), eq(oauthIdentities.openid, profile.openid)),
    });
    let userId: number;
    if (identity) {
        userId = identity.userId;
        const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
        if (u) await db.update(users).set({ avatar: profile.avatar || u.avatar, username: profile.username || u.username }).where(eq(users.id, u.id));
    } else {
        const loginName = `${provider}_` + crypto.randomBytes(6).toString('hex');
        const insert = await db.insert(users).values({ username: loginName, openid: loginName, avatar: profile.avatar, permission: 0 }).returning({ id: users.id });
        userId = insert[0].id;
        await db.insert(oauthIdentities).values({ userId, provider, openid: profile.openid, avatar: profile.avatar });
    }
    const token = await jwt.sign({ id: userId });
    set.headers['Set-Cookie'] = `token=${token}; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`;
    return token;
}

export function OAuthService() {
    return new Elysia()
        .use(setup())
        .get('/user/:provider', async ({ params, set, headers, request, env }) => {
            const provider = params.provider as Provider;
            const cfg = PROVIDERS[provider];
            if (!cfg) return 'Unsupported provider';
            const envObj: any = env;
            const { clientId, clientSecret } = await getCreds(provider, envObj);
            if (!clientId || !clientSecret) return 'Provider not configured';
            const origin = new URL(request.url).origin;
            const redirectUri = `${origin}/user/${provider}/callback`;
            const state = crypto.randomBytes(8).toString('hex');
            const refererOrigin = headers.referer ? new URL(headers.referer).origin : origin;
            // 存原始 origin（与 user.ts 的 GitHub 流程保持一致），不要在 cookie 里编码，
            // 否则回调读取时会被二次解码导致回跳 URL 错乱。
            (set.headers as Record<string, unknown>)['Set-Cookie'] = [
                `oauth_state=${state}; Path=/; Max-Age=600; SameSite=Lax`,
                `redirect_to=${refererOrigin}; Path=/; Max-Age=600; SameSite=Lax`,
            ];
            const authUrl = `${cfg.authorize}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${cfg.scope}`;
            set.redirect = provider === 'wechat' ? `${authUrl}#wechat_redirect` : authUrl;
        }, { params: t.Object({ provider: t.String() }) })
        .get('/user/:provider/callback', async ({ params, query, set, cookie, jwt, db, request, env }) => {
            const provider = params.provider as Provider;
            const cfg = PROVIDERS[provider];
            if (!cfg) { set.status = 400; return 'Unsupported provider'; }
            if (cookie.oauth_state?.value !== query.state) { set.status = 403; return 'State mismatch'; }
            const envObj: any = env;
            const { clientId, clientSecret } = await getCreds(provider, envObj);
            const origin = new URL(request.url).origin;
            const redirectUri = `${origin}/user/${provider}/callback`;
            let profile: OAuthProfile;
            try {
                if (provider === 'qq') profile = await exchangeQQ(query.code, clientId, clientSecret, redirectUri);
                else if (provider === 'weibo') profile = await exchangeWeibo(query.code, clientId, clientSecret, redirectUri);
                else profile = await exchangeWechat(query.code, clientId, clientSecret);
            } catch (e) {
                console.error('oauth error', e);
                set.status = 502;
                return 'OAuth failed';
            }
            const token = await upsertOAuthUser(db, jwt, set, provider, profile);
            const redirectHost = cookie.redirect_to?.value || origin;
            set.headers['Content-Type'] = 'text/html';
            set.redirect = `${redirectHost}/callback?token=${token}`;
        }, {
            params: t.Object({ provider: t.String() }),
            query: t.Object({ code: t.String(), state: t.String() }),
        });
}
