import { eq } from "drizzle-orm";
import { getDB } from "./di";
import { ratelimit } from "../db/schema";

export type RateLimitResult = { ok: boolean; retryAfter: number };

/**
 * 基于 D1 的滑动窗口限流（全局，跨 Worker 实例一致）。
 * @param key   限流维度，通常 `${route}:${ip}`
 * @param max   窗口内允许的最大请求数
 * @param windowSec 窗口时长（秒）
 * @returns ok=false 时 retryAfter 为还需等待的秒数
 *
 * 实现：每 key 一行，expires 为窗口结束的 unix 秒。命中未过期窗口则计数 +1；
 * 窗口过期或不存在则以新窗口重建（count=1）。过期行保留但无害，可在 cron 中定期清理。
 */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<RateLimitResult> {
    const db = getDB();
    const now = Math.floor(Date.now() / 1000);
    const row = await db.select().from(ratelimit).where(eq(ratelimit.key, key)).get() as
        | { count: number; expires: number }
        | undefined;
    if (row && row.expires > now) {
        if (row.count >= max) return { ok: false, retryAfter: row.expires - now };
        await db.update(ratelimit).set({ count: row.count + 1 }).where(eq(ratelimit.key, key));
        return { ok: true, retryAfter: 0 };
    }
    await db.insert(ratelimit).values({ key, count: 1, expires: now + windowSec })
        .onConflictDoUpdate({ target: ratelimit.key, set: { count: 1, expires: now + windowSec } });
    return { ok: true, retryAfter: 0 };
}
