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
    ): Promise<Response> {
        const db = drizzle(env.DB, { schema: schema })
        Container.set(envToken, env)
        Container.set(dbToken, db)

        const exist = Container.has("cache")
        if (!exist) {
            Container.set("cache", new CacheImpl());
            Container.set("server.config", new CacheImpl("server.config"));
            Container.set("client.config", new CacheImpl("client.config"));
            // 冷实例启动预热：把 server 配置载入内存，避免首个业务请求因初次拉取 R2 配置而延迟
            await ServerConfig().get('cdn_host');
        }

        return await new Elysia()
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
