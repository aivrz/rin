import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import Elysia, { t } from "elysia";
import path from "node:path";
import type { Env } from "../db/db";
import { setup } from "../setup";
import { getEnv } from "../utils/di";
import { createS3Client } from "../utils/s3";
import { accessHost as cdnAccessHost } from "../utils/cdn";

// 允许的图片扩展名 → 内容类型。用于校验预签名请求，避免客户端伪造扩展名把
// 非图片写进 R2（admin 专属，防的是格式滥用而非越权）。
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
                // 预签名直传：Worker 只签发一个限时 PUT URL（不接触文件字节），客户端直传 R2，
                // 省去代理上传的双倍流量与 CPU，并支持真实上传进度/可中断。
                // key 由客户端算出的 SHA-1 决定（天然去重），服务端用正则校验防路径穿越。
                .post('/sign', async ({ admin, set, body: { hash, ext, type } }) => {
                    const ce = configError();
                    if (ce) {
                        set.status = 500;
                        return ce;
                    }
                    // 仅管理员可获取上传凭证
                    if (!admin) {
                        set.status = 403;
                        return 'Permission denied';
                    }
                    if (!/^[a-f0-9]{40}$/.test(hash)) {
                        set.status = 400;
                        return 'bad hash';
                    }
                    if (!IMAGE_EXT[ext]) {
                        set.status = 400;
                        return 'bad ext';
                    }
                    // 类型须与扩展名严格对应，防客户端错配
                    if (IMAGE_EXT[ext] !== type) {
                        set.status = 400;
                        return 'bad type';
                    }
                    const key = path.join(folder, `${hash}.${ext}`);
                    try {
                        const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: type });
                        const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 600 });
                        const publicUrl = `${await cdnAccessHost(env)}/${key}`;
                        return { uploadUrl, publicUrl, key };
                    } catch (e: any) {
                        console.error('storage sign failed', e?.message ?? e);
                        set.status = 400;
                        return '生成上传凭证失败，请稍后重试';
                    }
                }, {
                    body: t.Object({
                        hash: t.String(),
                        ext: t.String(),
                        type: t.String()
                    })
                })
        );
}
