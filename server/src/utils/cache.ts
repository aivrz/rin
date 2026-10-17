import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import path from "path";
import Container, { Service } from "typedi";
import type { DB } from "../_worker";
import type { Env } from "../db/db";
import { getDB, getEnv } from "./di";
import { createS3Client } from "./s3";

// Cache Utils for storing data in memory and persisting to S3
// DO NOT USE THIS TO STORE SENSITIVE DATA

@Service()
export class CacheImpl {
    cache: Map<string, any> = new Map<string, any>();
    db: DB;
    env: Env;
    cacheUrl: string;
    cacheFolder: string;
    type: string;
    loaded: boolean = false;
    s3 = createS3Client();

    constructor(type: string = "cache") {
        this.type = type;
        this.db = getDB();
        this.env = getEnv();
        this.cache = new Map<string, any>();
        // S3_CACHE_FOLDER 在 docs/ENV.md 中标注为可选（默认 cache/），因此必须在此归一：
        // 读（cacheUrl）与写（save）共用同一目录，否则空串时会写入 S3 根目录、
        // 未定义时 path.join 抛错，导致「保存返回成功但刷新后配置丢失」。
        this.cacheFolder = this.env.S3_CACHE_FOLDER || 'cache';
        const slash = this.env.S3_ACCESS_HOST.endsWith('/') ? '' : '/';
        this.cacheUrl = this.env.S3_ACCESS_HOST + slash + this.objectKey();
    }

    /** S3 对象键：读、写共用同一寻址，从结构上杜绝两条通道指向不同对象 */
    objectKey() {
        return path.join(this.cacheFolder, `${this.type}.json`);
    }

    /** 把远端 JSON 合并进内存 Map */
    absorb(data: any) {
        if (!data || typeof data !== 'object') return;
        for (let key in data) {
            this.cache.set(key, data[key]);
        }
    }

    /**
     * 首选 S3 SDK 直读（与 save() 同 bucket、同凭证），保证「写入后立即读到新值」。
     * 原先经 S3_ACCESS_HOST 公共地址读，若该地址挂了 CDN，会命中边缘缓存里的旧副本，
     * 而 PUT 写的是源站；Worker 实例被回收重建后 load() 就读回不含新配置的旧 JSON，
     * 表现为「保存返回成功、刷新后配置丢失」。公共地址保留为回退，兼容 bucket 路径不一致的部署。
     */
    async load() {
        const key = this.objectKey();
        try {
            const res: any = await this.s3.send(new GetObjectCommand({
                Bucket: this.env.S3_BUCKET,
                Key: key,
            }));
            const text = await new Response(res.Body).text();
            this.absorb(text ? JSON.parse(text) : null);
            this.loaded = true;
            console.log('Cache load ok(s3)', key);
            return;
        } catch (e: any) {
            // 对象不存在 = 首次部署的正常空状态，必须置 loaded，否则后续保存会被写入保护一直拦下
            const status = e?.$metadata?.httpStatusCode;
            if (status === 404 || e?.name === 'NoSuchKey' || e?.name === 'NotFound') {
                this.loaded = true;
                console.log('Cache load empty(s3)', key);
                return;
            }
            console.warn('Cache load s3 failed, fallback to public url', key, e?.message);
        }
        try {
            const response = await fetch(new Request(this.cacheUrl));
            this.absorb(await response.json<any>());
            this.loaded = true;
            console.log('Cache load ok(public)', this.cacheUrl);
        } catch (e: any) {
            console.error('Cache load failed', key, this.cacheUrl);
            console.error(e.message);
        }
    }
    async all() {
        if (!this.loaded) {
            await this.load();
        }
        return this.cache;
    }
    async get(key: string) {
        if (!this.loaded) {
            await this.load();
        }
        return this.cache.get(key);
    }
    async getOrSet<T>(key: string, value: () => Promise<T>) {
        const cached = await this.get(key)
        if (cached !== undefined) {
            console.log('Cache hit', key);
            return cached as T;
        }
        console.log('Cache miss', key);
        const newValue = await value();
        await this.set(key, newValue);
        return newValue;
    }

    async getOrDefault<T>(key: string, defaultValue: T) {
        return this.getOrSet(key, async () => defaultValue);
    }
    

    async set(key: string, value: any, save: boolean = true) {
        if (!this.loaded)
            await this.load();
        this.cache.set(key, value);
        if (save) {
            await this.save();
        }
    }

    async delete(key: string, save: boolean = true) {
        if (!this.loaded)
            await this.load();
        this.cache.delete(key);
        if (save) {
            await this.save();
        }
    }

    async deletePrefix(prefix: string) {
        // 冷实例上内存 Map 为空，遍历不到任何 key，等于没删；先加载再操作
        if (!this.loaded)
            await this.load();
        for (let key of this.cache.keys()) {
            console.log('Cache key', key);
            if (key.startsWith(prefix)) {
                console.log('Cache delete', key);
                await this.delete(key, false);
            }
        }
        await this.save();
    }

    async clear() {
        // 必须先加载：否则内存 Map 本就是空的，clear() 后写回会把整个文件覆盖成 {}，
        // 而 save() 的未加载保护又会直接拒写，导致「清除缓存」静默失效。
        if (!this.loaded)
            await this.load();
        this.cache.clear();
        await this.save();
    }

    /**
     * @returns true 已落盘；false 未加载拒写或 PUT 失败
     */
    async save(): Promise<boolean> {
        const cacheKey = this.objectKey();
        // 未成功加载时内存 Map 可能是残缺的（只含本次写入的那一个 key），
        // 此时写回会把 favicon/footer 等既有配置全部抹掉，故直接拒写。
        if (!this.loaded) {
            console.error('Cache save aborted: not loaded', cacheKey);
            return false;
        }
        try {
            await this.s3.send(new PutObjectCommand({
                Bucket: this.env.S3_BUCKET,
                Key: cacheKey,
                Body: JSON.stringify(Object.fromEntries(this.cache))
            }));
            console.log('Cache saved', cacheKey);
            return true;
        } catch (e: any) {
            console.error('Cache save failed', cacheKey);
            console.error(e.message);
            return false;
        }
    }
}

export const PublicCache = () => Container.get<CacheImpl>("cache");
export const ServerConfig = () => Container.get<CacheImpl>("server.config");
export const ClientConfig = () => Container.get<CacheImpl>("client.config");