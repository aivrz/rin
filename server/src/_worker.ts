import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";
import { Elysia } from "elysia";
import 'reflect-metadata';
import Container from "typedi";
import type { Env } from "./db/db";
import * as schema from './db/schema';
import { app } from "./server";
import { friendCrontab } from "./services/friends";
import { rssCrontab } from "./services/rss";
import { CacheImpl } from "./utils/cache";
import { ConfigStore, ServerConfig } from "./utils/config-store";
import { dbToken, envToken } from "./utils/di";
import { RateLimiter } from "./utils/rate-limiter-do";
export type DB = DrizzleD1Database<typeof import("./db/schema")>

// Durable Object 必须作为脚本的具名导出，且 class_name 与 wrangler.toml 中一致
export { RateLimiter };

function initRuntime(env: Env, ctx: ExecutionContext) {
    const db = drizzle(env.DB, { schema: schema })
    Container.set(envToken, env)
    Container.set(dbToken, db)

    const exist = Container.has("cache")
    if (!exist) {
        // 公共缓存（可重建）走 S3 整份 JSON；站点配置（不可丢）走 D1 info 表逐行 upsert。
        // 二者分离后，「读一次配置」不再有能力把别的配置键写回旧值覆盖掉。
        Container.set("cache", new CacheImpl());
        Container.set("server.config", new ConfigStore("server.config"));
        Container.set("client.config", new ConfigStore("client.config"));
        // 预热仅为性能优化：用 waitUntil 在响应返回后异步进行，不再阻塞首个响应。
        ctx.waitUntil(ServerConfig().get('cdn_host'));
    }
    return db;
}

// 同源改造支持（P2-5）：若请求走主域 /api/* 路由，剥离前缀后再交给 Elysia
// （Elysia 路由是 /feed 等，不带 /api）。无 /api 前缀时原样处理（独立子域部署不变）。
// 剥前缀的同时注入 x-api-prefix 头：剥过后 handler 里的 request.url 已看不到 /api，
// 而 OAuth 回调地址等需要还原前缀才能落回 /api/* 路由。
function stripApiPrefix(request: Request): Request {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return request;
    const nu = new URL(request.url);
    nu.pathname = url.pathname.slice(4); // 去掉 '/api'
    const headers = new Headers(request.headers);
    headers.set('x-api-prefix', '/api');
    return new Request(nu, { method: request.method, headers, body: request.body, redirect: request.redirect });
}

export default {
    async fetch(
        request: Request,
        env: Env,
        ctx: ExecutionContext,
    ): Promise<Response> {
        initRuntime(env, ctx)
        return await new Elysia({ aot: false })
            .use(app())
            .handle(stripApiPrefix(request))
    },
    async scheduled(
        _controller: ScheduledController | null,
        env: Env,
        ctx: ExecutionContext
    ) {
        initRuntime(env, ctx)
        // P2-2：cron 重活异步化。若配置了队列，则把任务入队由队列消费者执行（削峰/重试）；
        // 未配置队列（本地 dev 等）则直接同步执行，保证功能不依赖队列。
        if (env.MY_QUEUE) {
            await env.MY_QUEUE.send({ type: 'friend' });
            await env.MY_QUEUE.send({ type: 'rss' });
        } else {
            await friendCrontab(env, ctx)
            await rssCrontab(env)
        }
    },
    // P2-2：队列消费者（与生产者同脚本）。收到消息后执行对应的 cron 任务。
    async queue(
        batch: any,
        env: Env,
        ctx: ExecutionContext
    ) {
        initRuntime(env, ctx)
        for (const msg of batch.messages as any[]) {
            const type = (msg.body as any)?.type
            if (type === 'friend') await friendCrontab(env, ctx)
            else if (type === 'rss') await rssCrontab(env)
        }
    },
}
