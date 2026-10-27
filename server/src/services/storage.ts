import { PutObjectCommand } from "@aws-sdk/client-s3";
import Elysia, { t } from "elysia";
import path from "node:path";
import type { Env } from "../db/db";
import { setup } from "../setup";
import { getEnv } from "../utils/di";
import { createS3Client } from "../utils/s3";
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
    const endpoint = env.S3_ENDPOINT;
    const bucket = env.S3_BUCKET;
    const folder = env.S3_FOLDER || '';
    const accessKeyId = env.S3_ACCESS_KEY_ID;
    const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
    const s3 = createS3Client();

    // 配置缺失集中校验：缺任一 S3 变量直接 500 + 具体变量名。
    function configError(): string | null {
        if (!endpoint) return 'S3_ENDPOINT is not defined';
        if (!accessKeyId) return 'S3_ACCESS_KEY_ID is not defined';
        if (!secretAccessKey) return 'S3_SECRET_ACCESS_KEY is not defined';
        if (!bucket) return 'S3_BUCKET is not defined';
        return null;
    }

    return new Elysia({ aot: false })
        .use(setup())
        .group('/storage', (group) =>
            group
                // 唯一上传通道：字节经 Worker 代理转发到 R2，不依赖 R2 桶的 CORS 配置，
                // 行为确定、部署简单。保留 SHA-1 内容去重（相同图片复用已有对象）与 admin 守卫。
                .post('/', async ({ admin, set, body: { key, file } }) => {
                    const ce = configError();
                    if (ce) {
                        set.status = 500;
                        return ce;
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
                        // 传 Uint8Array 而非 File/Blob：长度可知，SDK 不会退化为
                        // STREAMING-UNSIGNED-PAYLOAD-TRAILER（R2 不支持，会返回 400）。
                        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: hashkey, Body: new Uint8Array(buf), ContentType: contentType }));
                        return `${await cdnAccessHost(env)}/${hashkey}`;
                    } catch (e: any) {
                        // 透出真实 S3 错误便于排查（自托管管理端，暴露 S3 文案无碍）
                        const detail = (e?.message || String(e)).slice(0, 300);
                        console.error('storage upload failed', detail);
                        set.status = 400;
                        return '上传失败：' + detail;
                    }
                }, {
                    body: t.Object({
                        key: t.String(),
                        file: t.File()
                    })
                })
        );
}
