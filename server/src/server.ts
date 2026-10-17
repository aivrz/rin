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
import { WechatService } from './services/wechat';
import { OAuthService } from './services/oauth';

export const app = () => new Elysia({ aot: false })
    .use(cors({
        origin: true,
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
    .use(WechatService())
    .use(OAuthService())
    .get('/', () => `Hi`)
    .onAfterHandle(({ request, set }) => {
        // 公共匿名 GET 统一加边缘缓存；用户态（带 authorization 或 token cookie）不缓存，避免串号
        if (request.method !== 'GET') return;
        const auth = request.headers.get('authorization');
        const cookie = request.headers.get('cookie') || '';
        if (auth || cookie.includes('token=')) return;
        if (set.headers['Cache-Control'] || set.headers['cache-control']) return;
        set.headers['Cache-Control'] = 'public, s-maxage=60, max-age=60, stale-while-revalidate=300';
    })
    .onError(({ path, params, code }) => {
        if (code === 'NOT_FOUND')
            return `${path} ${JSON.stringify(params)} not found`
    })

export type App = ReturnType<typeof app>;