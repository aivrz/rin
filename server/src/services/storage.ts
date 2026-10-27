import Elysia, { t } from "elysia";
import path from "node:path";
import type { Env } from "../db/db";
import { setup } from "../setup";
import { getEnv } from "../utils/di";
import { accessHost as cdnAccessHost } from "../utils/cdn";

function buf2hex(buffer: ArrayBuffer) {
    return [...new Uint8Array(buffer)]
        .map(x => x.toString(16).padStart(2, '0'))
        .join('');
}

// 允许的图片扩展名 → 内容类型。用于校验，避免把非图片写进 R2。
const IMAGE_EXT: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    avif: "image/avif",
};

function extFromName(name: string): string {
    const m = name.match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toLowerCase() : "";
}

// 魔数兜底：文件名无扩展名或扩展名不可信时，按文件头判断真实格式。
function extFromMagic(buf: ArrayBuffer): string {
    const b = new Uint8Array(buf.slice(0, 12));
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "gif";
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
    return "";
}

export function StorageService() {
    const env: Env = getEnv();
    const folder = env.S3_FOLDER || '';

    return new Elysia({ aot: false })
        .use(setup())
        .group('/storage', (group) =>
            group
                // 唯一上传通道：字节经 Worker 代理转发到 R2 绑定，不依赖 R2 桶 CORS 配置，
                // 行为确定、部署简单。R2 通过 Worker 绑定（env.RIN_BUCKET）访问，无需任何 S3 凭证。
                // 保留 SHA-1 内容去重（相同图片复用已有对象）与 admin 守卫。
                .post('/', async ({ admin, set, body: { key, file } }) => {
                    if (!env.RIN_BUCKET) {
                        set.status = 500;
                        return 'RIN_BUCKET binding is not configured';
                    }
                    if (!admin) {
                        set.status = 403;
                        return 'Permission denied';
                    }
                    if (file.size > 10 * 1024 * 1024) {
                        set.status = 413;
                        return '文件过大（上限 10MB）';
                    }
                    const declared = file.type || '';
                    if (!declared.startsWith('image/')) {
                        set.status = 415;
                        return '仅支持图片文件';
                    }
                    let suffix = extFromName(file.name || key || '');
                    if (!IMAGE_EXT[suffix]) {
                        const magic = extFromMagic(await file.arrayBuffer());
                        if (magic) suffix = magic;
                    }
                    if (!suffix || !IMAGE_EXT[suffix]) {
                        set.status = 415;
                        return '不支持的图片格式';
                    }
                    const contentType = IMAGE_EXT[suffix];
                    const buf = await file.arrayBuffer();
                    const hashArray = await crypto.subtle.digest({ name: 'SHA-1' }, buf);
                    const hash = buf2hex(hashArray);
                    const hashkey = path.join(folder, hash + "." + suffix);
                    try {
                        // 传 Uint8Array 而非 File/Blob：长度可知，避免 SDK 流式负载退化。
                        await env.RIN_BUCKET.put(hashkey, new Uint8Array(buf), { httpMetadata: { contentType } });
                        return `${await cdnAccessHost(env)}/${hashkey}`;
                    } catch (e: any) {
                        // 透出真实错误便于排查（自托管管理端，暴露 R2 文案无碍）。
                        // 不加「上传失败」前缀：前端 errorMessage 会统一包 upload.failed$message。
                        const detail = (e?.message || String(e)).slice(0, 300);
                        console.error('storage upload failed', detail);
                        set.status = 400;
                        return detail || '上传失败，请稍后重试';
                    }
                }, {
                    body: t.Object({
                        key: t.String(),
                        file: t.File()
                    })
                })
        );
}
