import { ServerConfig } from "./config-store";
import type { Env } from "../db/db";

// cdn_host 解析：后端设置（server.config）优先，环境变量兜底；空白视为未开启 CDN。
export async function cdnHost(env: Env): Promise<string> {
    const cfg = (await ServerConfig().get("cdn_host")) as string | undefined;
    return (cfg && cfg.trim()) || env.CDN_HOST || "";
}

// 有效的图片访问域名：cdn 启用时取 cdn 域名；否则回退 S3_ACCESS_HOST / S3_ENDPOINT（本地开发直连 R2）。
export async function accessHost(env: Env): Promise<string> {
    const host = await cdnHost(env);
    if (host) return host;
    return env.S3_ACCESS_HOST || env.S3_ENDPOINT || "";
}

// 把单个 URL 中的 S3_ACCESS_HOST 主机实时替换为 cdn 域名（存量图加速，不改库）。
// host 为空或 URL 不含源域名时原样返回。
export function rewriteCdnStr(url: string | null | undefined, host: string, from: string): string {
    if (!url) return url ?? "";
    if (!host || !from) return url;
    return url.includes(from) ? url.split(from).join(host) : url;
}
