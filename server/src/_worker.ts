import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";
import { Elysia } from "elysia";
import 'reflect-metadata';
import Container from "typedi";
import type { Env } from "./db/db";
import * as schema from './db/schema';
import { app } from "./server";
import { friendCrontab } from "./services/friends";
import { rssCrontab } from "./services/rss";
import { CacheImpl, ServerConfig } from "./utils/cache";
import { dbToken, envToken } from "./utils/di";
export type DB = DrizzleD1Database<typeof import("./db/schema")>

export default {
    async fetch(
        request: Request,
        env: Env,
        ctx: ExecutionContext,
    ): Promise<Response> {
        const db = drizzle(env.DB, { schema: schema })
        Container.set(envToken, env)
        Container.set(dbToken, db)

        const exist = Container.has("cache")
        if (!exist) {
            Container.set("cache", new CacheImpl());
            Container.set("server.config", new CacheImpl("server.config"));
            Container.set("client.config", new CacheImpl("client.config"));
            // 预热仅为性能优化：改用 waitUntil 在响应返回后异步进行，不再阻塞首个响应。
            // 原先在此处同步 await，会让每个冷实例的**所有**请求（含 CORS 预检）
            // 都先陪等一次完整 S3 往返才进入路由匹配。
            // 正确性由 CacheImpl 的 `if (!this.loaded) await this.load()` 懒加载兜底。
            ctx.waitUntil(ServerConfig().get('cdn_host'));
        }

        return await new Elysia({ aot: false })
            .use(app())
            .handle(request)
    },
    async scheduled(
        _controller: ScheduledController | null,
        env: Env,
        ctx: ExecutionContext
    ) {
        const db = drizzle(env.DB, { schema: schema })
        Container.set(envToken, env)
        Container.set(dbToken, db)

        const exist = Container.has("cache")
        if (!exist) {
            Container.set("cache", new CacheImpl());
            Container.set("server.config", new CacheImpl("server.config"));
            Container.set("client.config", new CacheImpl("client.config"));
        }

        await friendCrontab(env, ctx)
        await rssCrontab(env)
    },
}
