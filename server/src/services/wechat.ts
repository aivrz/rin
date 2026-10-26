import Elysia, { t } from "elysia";
import { eq } from "drizzle-orm";
import type { DB } from "../_worker";
import { users, ewsLogs } from "../db/schema";
import { setup } from "../setup";
import { ServerConfig } from "../utils/config-store";
import { randomHex, sha1Hex } from "../utils/crypto";
import { cookieAttrs } from "../utils/cookie";

// 关注公众号登录（erphp-weixin-scan 整合）+ 微信消息回调。
// 流程：用户关注并回复"登录" → Worker 消息回调生成 6 位验证码并回复发给用户 →
//      用户在前端面板输入验证码 → POST /ews/login 校验 → 建/登账号（JWT cookie）。

const EWS_VALID_MS = 5 * 60 * 1000;

function genCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function nowStr(): string {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// 微信消息签名校验：sha1(排序后 [token, timestamp, nonce]) === signature。
// sha1Hex 用 Web Crypto：node:crypto 的 createHash 在本项目的旧版 node_compat 下不可用（见 utils/crypto.ts）
async function verifyWechatSignature(token: string, signature: string, timestamp: string, nonce: string): Promise<boolean> {
    const sha = await sha1Hex([token, timestamp, nonce].sort().join(''));
    return sha === signature.toLowerCase();
}

// 解析微信推送的 XML（兼容 CDATA）
function parseWechatXml(xml: string): { FromUserName: string; ToUserName: string; Content: string; Event: string } {
    const pick = (tag: string): string => {
        const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, 'i');
        return (re.exec(xml)?.[1] || '').trim();
    };
    return {
        FromUserName: pick('FromUserName'),
        ToUserName: pick('ToUserName'),
        Content: pick('Content'),
        Event: pick('Event'),
    };
}

// 被动回复文本消息（需在 5 秒内响应）
function buildPassiveText(toUser: string, fromUser: string, content: string): string {
    return `<xml>
<ToUserName><![CDATA[${toUser}]]></ToUserName>
<FromUserName><![CDATA[${fromUser}]]></FromUserName>
<CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${content}]]></Content>
</xml>`;
}

// 按 weixinid 建或查用户，并签发 JWT 写入 cookie
async function upsertWeixinUser(db: DB, jwt: any, set: any, openid: string, nickname: string, avatar: string, request?: Request) {
    let user = await db.query.users.findFirst({ where: eq(users.weixinid, openid) });
    if (!user) {
        const loginName = 'wx_' + randomHex(8);
        const result = await db.insert(users).values({
            username: loginName,
            openid: loginName,
            avatar: avatar || '',
            weixinid: openid,
            permission: 0,
        }).returning({ id: users.id });
        user = await db.query.users.findFirst({ where: eq(users.id, result[0].id) });
    } else {
        const patch: any = {};
        if (nickname) patch.username = nickname;
        if (avatar) patch.avatar = avatar;
        if (Object.keys(patch).length) await db.update(users).set(patch).where(eq(users.id, user.id));
    }
    const token = await jwt.sign({ id: user!.id });
    set.headers['Set-Cookie'] = `token=${token}; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax${cookieAttrs(request)}`;
    return user!;
}

export function WechatService() {
    return new Elysia({ aot: false })
        .use(setup())
        .group('/ews', (group) =>
            group
                // 前端轮询：按验证码换取登录态
                .post('/login', async ({ db, jwt, set, request, body: { code } }) => {
                    if (!code) return { status: 0 };
                    const rows = await db.select().from(ewsLogs).where(eq(ewsLogs.sceneId, String(code))).limit(1).all() as any[];
                    const rec = rows[0];
                    if (!rec || !rec.openid) return { status: 0 };
                    const updated = new Date(rec.updateTime || rec.createTime || 0).getTime();
                    if (Date.now() - updated > EWS_VALID_MS) return { status: 0, message: '验证码已过期' };
                    await upsertWeixinUser(db, jwt, set, rec.openid, rec.nickname || '', rec.avatar || '', request);
                    return { status: 1 };
                }, {
                    body: t.Object({ code: t.String() })
                })
                // 已登录用户绑定微信
                .post('/bind', async ({ db, set, uid, body: { code } }) => {
                    if (!uid) { set.status = 401; return 'Unauthorized'; }
                    if (!code) return '0';
                    const rows = await db.select().from(ewsLogs).where(eq(ewsLogs.sceneId, String(code))).limit(1).all() as any[];
                    const rec = rows[0];
                    if (!rec || !rec.openid) return '0';
                    const updated = new Date(rec.updateTime || rec.createTime || 0).getTime();
                    if (Date.now() - updated > EWS_VALID_MS) return '0';
                    const exist = await db.query.users.findFirst({ where: eq(users.weixinid, rec.openid) });
                    if (exist && exist.id !== uid) return '2'; // 已被其他账号绑定
                    await db.update(users).set({ weixinid: rec.openid, avatar: rec.avatar || undefined }).where(eq(users.id, uid));
                    return '1';
                }, {
                    body: t.Object({ code: t.String() })
                })
                // 前端获取关注二维码地址（公开，仅返回图片 URL）
                .get('/qrcode', async ({ env }) => {
                    const raw = (await ServerConfig().get('ews_qrcode_url')) || env.EWS_QRCODE_URL || '';
                    // migrator 在环境变量缺失时曾把字面量 "undefined" 写进 wrangler.toml [vars]，
                    // 前端会拿到 src="undefined" 的裂图，这里过滤掉
                    return { qrcodeUrl: raw === 'undefined' ? '' : raw };
                })
        )
        // 微信消息回调（GET 校验签名回显 echostr；POST 处理用户回复）
        .get('/wechat/callback', async ({ env, query }) => {
            const { signature, timestamp, nonce, echostr } = query as any;
            const token = (await ServerConfig().get('ews_token')) || env.EWS_TOKEN || '';
            if (!(await verifyWechatSignature(token, signature || '', timestamp || '', nonce || ''))) {
                return 'invalid signature';
            }
            return echostr || 'ok';
        }, {
            query: t.Object({
                signature: t.Optional(t.String()),
                timestamp: t.Optional(t.String()),
                nonce: t.Optional(t.String()),
                echostr: t.Optional(t.String()),
            })
        })
        .post('/wechat/callback', async ({ db, request, set }) => {
            const rawBody = await request.text();
            const msg = parseWechatXml(rawBody);
            const fromUser = msg.FromUserName || '';
            const toUser = msg.ToUserName || '';
            const content: string = (msg.Content || '').toString();
            const event: string = (msg.Event || '').toString().toLowerCase();
            const want = event === 'subscribe' || event === 'scan' || /登录|绑定/.test(content);
            if (want) {
                const code = genCode();
                const now = nowStr();
                const exist = await db.select().from(ewsLogs).where(eq(ewsLogs.openid, fromUser)).limit(1).all() as any[];
                if (exist[0]) {
                    await db.update(ewsLogs).set({ sceneId: code, updateTime: now }).where(eq(ewsLogs.openid, fromUser));
                } else {
                    await db.insert(ewsLogs).values({ openid: fromUser, sceneId: code, createTime: now, updateTime: now });
                }
                const text = `您的登录验证码是 ${code}，5 分钟内有效，请在登录面板的验证码框中输入。`;
                set.headers['Content-Type'] = 'application/xml; charset=utf-8';
                return buildPassiveText(fromUser, toUser, text);
            }
            set.headers['Content-Type'] = 'application/xml; charset=utf-8';
            return buildPassiveText(fromUser, toUser, '欢迎关注～回复"登录"获取登录验证码。');
        });
}
