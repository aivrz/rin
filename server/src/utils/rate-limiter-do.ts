import type { DurableObjectState } from "@cloudflare/workers-types";
import type { Env } from "../db/db";

interface LimiterData {
    count: number;
    expires: number; // epoch ms
}

/**
 * 基于 Durable Object 的精确全局限流：每个 key 对应一个 DO 实例（idFromName），
 * 单实例串行处理，保证计数严格一致（无 KV 最终一致带来的超放）。存储用 DO 自身
 * storage（不占 D1/R2 额度）。用于 ews/login 等需强一致计数的接口。
 *
 * 调用方见 doRateLimit()：拿 stub 后发一个 GET 请求带 key/max/window 查询参数，
 * 返回的 JSON 为 { ok, retryAfter }。
 */
export class RateLimiter {
    constructor(private state: DurableObjectState) {}

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const key = url.searchParams.get('key') || 'default';
        const max = parseInt(url.searchParams.get('max') || '20', 10);
        const windowSec = parseInt(url.searchParams.get('window') || '600', 10);
        const now = Date.now();

        const data = (await this.state.storage.get<LimiterData>(key)) || { count: 0, expires: 0 };

        // 窗口已过期 → 重新开窗（count=1）
        if (data.expires <= now) {
            await this.state.storage.put<LimiterData>(key, { count: 1, expires: now + windowSec * 1000 });
            return Response.json({ ok: true, retryAfter: 0 });
        }
        // 窗口内超限 → 拒绝，返回还需等待秒数
        if (data.count >= max) {
            return Response.json({ ok: false, retryAfter: Math.ceil((data.expires - now) / 1000) });
        }
        // 窗口内计数 +1
        await this.state.storage.put<LimiterData>(key, { count: data.count + 1, expires: data.expires });
        return Response.json({ ok: true, retryAfter: 0 });
    }
}

/**
 * 调用 DO 限流；若 RATE_LIMITER 绑定未配置（本地 dev / 未启用 DO），返回放行，由调用方降级到 D1 限流。
 */
export async function doRateLimit(env: Env, key: string, max: number, windowSec: number): Promise<{ ok: boolean; retryAfter: number }> {
    if (!env.RATE_LIMITER) return { ok: true, retryAfter: 0 };
    const id = env.RATE_LIMITER.idFromName(key);
    const stub = env.RATE_LIMITER.get(id);
    const res = await stub.fetch(`https://rin/limit?key=${encodeURIComponent(key)}&max=${max}&window=${windowSec}`);
    return (await res.json()) as { ok: boolean; retryAfter: number };
}
