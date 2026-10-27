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

// 允许的图片扩展名 → 内容类型。用于服务端二次校验，避免客户端伪造 Content-Type
// 把非图片（如 .html）写进 R2 造成存储型 XSS。
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
    // 图片仍物理上传到 R2（S3 兼容），但访问域名优先走七牛镜像回源 CDN_HOST（含后端设置 cdn_host）；
    // 未配置时回退到原 S3_ACCESS_HOST / endpoint，保证本地开发可用。
    const accessKeyId = env.S3_ACCESS_KEY_ID;
    const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
    const s3 = createS3Client();

    // 配置缺失集中校验：缺任一 S3 变量直接 500 + 具体变量名，避免散落重复判断。
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
                .post('/', async ({ admin, set, body: { key, file } }) => {
                    const ce = configError();
                    if (ce) {
                        set.status = 500;
                        return ce;
                    }
                    // 仅管理员可上传：/storage 只服务于写作页与设置页的图片，属管理员专属能力，
                    // 不能让任意登录用户向 R2 写入任意文件。
                    if (!admin) {
                        set.status = 403;
                        return 'Permission denied';
                    }
                    // 服务端硬上限：客户端虽有 5MB 校验，但请求体不可信，超大会拖垮 Worker CPU / 存储
                    if (file.size > 10 * 1024 * 1024) {
                        set.status = 413;
                        return '文件过大（上限 10MB）';
                    }
                    const declared = file.type || '';
                    if (!declared.startsWith('image/')) {
                        set.status = 415;
                        return '仅支持图片文件';
                    }
                    // 扩展名优先取文件名，不可信时按魔数兜底；最终必须落在允许列表内
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
                        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: hashkey, Body: file, ContentType: contentType }));
                        return `${await cdnAccessHost(env)}/${hashkey}`;
                    } catch (e: any) {
                        // 不把 AWS 原始错误回传客户端（可能泄露内部信息）；仅记录日志
                        console.error('storage upload failed', e?.message ?? e);
                        set.status = 400;
                        return '上传失败，请稍后重试';
                    }
                }, {
                    body: t.Object({
                        key: t.String(),
                        file: t.File()
                    })
                })
        );
}
