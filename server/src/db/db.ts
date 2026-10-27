import { drizzle } from 'drizzle-orm/d1';
import type { R2Bucket } from "@cloudflare/workers-types";

export interface Env {
    DB: D1Database;
    RIN_GITHUB_CLIENT_ID: string;
    RIN_GITHUB_CLIENT_SECRET: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    JWT_SECRET: string;
    FRONTEND_URL: string;
    S3_ENDPOINT: string,
    S3_ACCESS_HOST: string,
    CDN_HOST: string,
    S3_FOLDER: string,
    S3_CACHE_FOLDER: string,
    WEBHOOK_URL: string,
    // R2 通过 Worker 绑定访问，无需任何 S3 凭证
    RIN_BUCKET: R2Bucket,

    RSS_TITLE: string,
    RSS_DESCRIPTION: string,
}

export function db(env: Env) {
    return drizzle(env.DB);
}
export default db;