import cors from '@elysiajs/cors';
import { serverTiming } from '@elysiajs/server-timing';
import { Elysia } from 'elysia';
import { CommentService } from './services/comments';
import { FeedService } from './services/feed';
import { FriendService } from './services/friends';
import { RSSService } from './services/rss';
import { SEOService } from './services/seo';
import { StorageService } from './services/storage';
import { TagService } from './services/tag';
import { UserService } from './services/user';
import { ConfigService } from './services/config';
import { MusicService } from './services/music';
import { WechatService } from './services/wechat';
import { OAuthService } from './services/oauth';

// CORS：仅允许已知前端域 + 本地开发域，避免「任意源 + credentials」的 CSRF / 数据泄露风险。
// FRONTEND_URL 为部署时注入的明文变量（wrangler [vars]），可逗号分隔多个；自动补全 www/裸域变体。
// 未配置时回退为反射（origin: true），避免未知环境被锁死。
// 注：带 Authorization / x-anon-id 的请求仍会触发预检（非简单请求），属鉴权链路固有行为。
const runtimeEnv: Record<string, string | undefined> = (globalThis as any).process?.env || {};
const frontendUrl = runtimeEnv.FRONTEND_URL || '';
const allowedOrigins = new Set<string>();
for (const raw of frontendUrl.split(',').map(s => s.trim()).filter(Boolean)) {
    try {
        const u = new URL(raw);
        const naked = u.origin.startsWith('https://www.')
            ? u.origin.replace('https://www.', 'https://')
            : u.origin.replace(u.hostname, 'www.' + u.hostname);
        allowedOrigins.add(u.origin);
        allowedOrigins.add(naked);
    } catch {
        allowedOrigins.add(raw);
    }
}
for (const dev of ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000']) {
    allowedOrigins.add(dev);
}

export const app = () => new Elysia({ aot: false })
    .use(cors({
        // 白名单数组：Elysia 会回显匹配的源、拒绝其余；未配置 FRONTEND_URL 时回退为反射
        origin: frontendUrl ? Array.from(allowedOrigins) : true,
        methods: '*',
        allowedHeaders: [
            'authorization',
            'content-type',
            'x-anon-id'
        ],
        maxAge: 600,
        credentials: true,
        preflight: true
    }))
    .use(serverTiming({
        enabled: true,
    }))
    .use(UserService())
    .use(FeedService())
    .use(CommentService())
    .use(TagService())
    .use(StorageService())
    .use(FriendService())
    .use(SEOService())
    .use(RSSService())
    .use(ConfigService())
    .use(MusicService())
    .use(WechatService())
    .use(OAuthService())
    .get('/', () => `Hi`)
    .onAfterHandle(({ request, set }) => {
        // 站点配置绝不能被缓存：播放器与 App 初始化读 /config/client 用的是匿名 GET，
        // 若命中边缘缓存，前台会读到不含 music 等新值的旧副本（表现为「保存成功但刷新后配置丢失」）。
        // 这里显式下发 no-store，同时切断 Cloudflare 边缘缓存与浏览器 max-age 缓存；
        // 仅排除 /config，其余公共数据接口（feed/hashtags/friends）的边缘缓存保持不变。
        // 统一安全响应头：JSON API 重点是防点击劫持与 MIME 嗅探（脚本类策略对 JSON 无意义）
        set.headers['X-Content-Type-Options'] = 'nosniff';
        set.headers['X-Frame-Options'] = 'SAMEORIGIN';
        set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
        set.headers['Content-Security-Policy'] = "default-src 'none'; frame-ancestors 'self'";
        set.headers['Strict-Transport-Security'] = 'max-age=31536000';
        const pathname = new URL(request.url).pathname;
        if (pathname === '/config' || pathname.startsWith('/config/')) {
            set.headers['Cache-Control'] = 'no-store';
            return;
        }
        // 音频流不进边缘缓存：这个路由自己返回 Range/206 响应，Cache-Control 挂在
        // 返回的 Response 上而非 set.headers 上，下面的守卫看不到它，会被 s-maxage 覆盖。
        // 边缘把整段音频按 200 缓存后再忽略 Range，会导致续播/拖动异常。
        // 这里直接放行，沿用路由内的 Cache-Control（max-age=600，仅浏览器缓存）。
        if (pathname.startsWith('/music/netease/url/')) return;
        // 公共匿名 GET 统一加边缘缓存；用户态（带 authorization 或 token cookie）不缓存，避免串号
        if (request.method !== 'GET') return;
        const auth = request.headers.get('authorization');
        const cookie = request.headers.get('cookie') || '';
        if (auth || cookie.includes('token=')) return;
        // seo/rss 在自身 Response 上设置了更精细的 Cache-Control（s-maxage=300/600），
        // 不在此覆盖，否则会被通用 s-maxage=60 抹平，导致边缘缓存时间变短
        if (pathname.startsWith('/seo/') || pathname.startsWith('/sub/')) return;
        if (set.headers['Cache-Control'] || set.headers['cache-control']) return;
        set.headers['Cache-Control'] = 'public, s-maxage=60, max-age=60, stale-while-revalidate=300';
    })
    .onError(({ path, params, code }) => {
        if (code === 'NOT_FOUND')
            return `${path} ${JSON.stringify(params)} not found`
    })

export type App = ReturnType<typeof app>;