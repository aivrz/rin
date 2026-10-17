import Elysia, { t } from "elysia";
import { oauth2 } from "elysia-oauth2";
import type { DB } from "./_worker";
import type { Env } from "./db/db";
import { getEnv, getDB } from "./utils/di";
import jwt from "./utils/jwt";


const anyUser = async (db: DB) => (await db.query.users.findMany())?.length > 0

// 将匿名标识（前端 localStorage UUID）映射为稳定的负整数，复用 likes.userId 列，避免新增表字段
function anonIdToUid(anonId: string | undefined): number | undefined {
    if (!anonId) return undefined
    let h = 0x811c9dc5
    for (let i = 0; i < anonId.length; i++) {
        h ^= anonId.charCodeAt(i)
        h = Math.imul(h, 0x01000193)
    }
    const u = (h >>> 0) % 2_000_000_000
    return -1 - u
}
export function setup() {
    const env: Env = getEnv();
    let gh_client_id = env.RIN_GITHUB_CLIENT_ID || env.GITHUB_CLIENT_ID;
    let gh_client_secret = env.RIN_GITHUB_CLIENT_SECRET || env.GITHUB_CLIENT_SECRET;
    let jwt_secret = env.JWT_SECRET;

    if (!gh_client_id || !gh_client_secret) {
        throw new Error('Please set RIN_GITHUB_CLIENT_ID and RIN_GITHUB_CLIENT_SECRET');
    }
    if (!jwt_secret) {
        throw new Error('Please set JWT_SECRET');
    }
    const oauth = oauth2({
        GitHub: [
            gh_client_id,
            gh_client_secret
        ]
    })
    return new Elysia({ name: 'setup', aot: false })
        .state('anyUser', anyUser)
        .use(oauth)
        .use(
            jwt({
                name: 'jwt',
                secret: jwt_secret,
                aot: false, // 禁用 JWT schema 的 JIT 编译（Type.Compile/new Function），Cloudflare Workers 默认禁止代码生成，否则启动即抛 EvalError
                schema: t.Object({
                    id: t.Integer(),
                    username: t.Optional(t.String()),
                    permission: t.Optional(t.Integer()),
                })
            })
        )
        .derive({ as: 'global' }, async ({ headers, jwt }) => {
            const anonUid = anonIdToUid(headers['x-anon-id'])
            const authorization = headers['authorization']
            if (!authorization) {
                return { anonUid };
            }
            const token = authorization.split(' ')[1]
            if (process.env.NODE_ENV?.toLowerCase() === 'test') {
                console.warn('Now in test mode, skip jwt verification.')
                try {
                    const p = JSON.parse(token)
                    return { uid: p.id, username: p.username, admin: p.permission === 1, anonUid };
                } catch (e) {
                    return { anonUid };
                }
            }
            const profile = await jwt.verify(token)
            if (!profile) {
                return { anonUid };
            }
            // 登录态直接取 JWT payload 中的 id/username/permission，避免每请求查 users 表
            return {
                uid: (profile as any).id,
                username: (profile as any).username,
                admin: (profile as any).permission === 1,
                anonUid,
            }
        })
        // 把 env/db 从 typedi Container 显式注入 Elysia 上下文并带正确类型：
        // oauth.ts/wechat.ts 的 handler 直接解构 ({ env, db })，但全仓库从未以 .state() 注入，
        // 仅靠 aot:false 宽松推断放行；此处补上类型与真实实例（同时修复运行时 c.env/c.db 为 undefined 的隐患）。
        // Env 不含 EWS_*/QQ_*/WECHAT_* 字段且 OAuth 用动态字符串索引，故交集成 Record<string, any>。
        .derive({ as: 'global' }, () => ({
            env: getEnv() as Env & Record<string, any>,
            db: getDB(),
        }))
}
