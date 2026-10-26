/**
 * Workers 兼容的哈希/随机工具。
 *
 * 为什么不用 node:crypto：wrangler 的 compatibility_date = "2024-05-29" 走旧版
 * node_compat polyfill，它不提供 createHash（较新的 nodejs_compat v2 才有），
 * 运行时抛错导致 /wechat/callback 500 —— 微信后台配置校验表现为「HTTP 返回非 200」。
 * 这里统一改用 Web Crypto：Workers、Node 18+、bun 都原生内置，无 polyfill 依赖。
 */

/** hex 随机串（n 字节 → 2n 个 hex 字符），替代 crypto.randomBytes(n).toString('hex') */
export function randomHex(n: number): string {
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** sha1 hex 摘要（微信消息签名用），替代 crypto.createHash('sha1').update(x).digest('hex') */
export async function sha1Hex(input: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
