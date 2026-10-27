import path from "path";
import Container, { Service } from "typedi";
import type { DB } from "../_worker";
import type { Env } from "../db/db";
import { getDB, getEnv } from "./di";

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
            const obj = await this.env.RIN_BUCKET.get(key);
            if (!obj) {
                this.loaded = true;
                console.log('Cache load empty', key);
                return;
            }
            const text = await obj.text();
            this.absorb(text ? JSON.parse(text) : null);
            this.loaded = true;
            console.log('Cache load ok', key);
            return;
        } catch (e: any) {
            // R2 绑定读取异常（网络/权限）时回退到公共地址，保证可用性
            console.warn('Cache load r2 failed, fallback to public url', key, e?.message);
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
    /**
     * 真缓存专用：未命中时计算并写回。
     * 注意语义差异——本方法会把整份内存快照写回 S3，因此**不得**用于「用户配置」：
     * 读配置时调它会把快照里的旧值覆盖回存储（历史上 music 被反复抹除的根因）。
     * 站点配置见 utils/config-store.ts 的 ConfigStore（落 D1，逐键 upsert）。
     */
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

    /** @returns true 已落盘；false 未加载拒写或 PUT 失败 */
    async clear(): Promise<boolean> {
        // 必须先加载：否则内存 Map 本就是空的，clear() 后写回会把整个文件覆盖成 {}，
        // 而 save() 的未加载保护又会直接拒写，导致「清除缓存」静默失效。
        if (!this.loaded)
            await this.load();
        this.cache.clear();
        return await this.save();
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
            await this.env.RIN_BUCKET.put(cacheKey, JSON.stringify(Object.fromEntries(this.cache)));
            console.log('Cache saved', cacheKey);
            return true;
        } catch (e: any) {
            console.error('Cache save failed', cacheKey);
            console.error(e.message);
            return false;
        }
    }
}

/**
 * 公共缓存：承载高频可重建数据（feed 列表、sitemap、RSS/SEO 缓存）。
 * DO NOT USE THIS TO STORE SENSITIVE DATA，也**不可**用于站点配置（见 config-store.ts）。
 */
export const PublicCache = () => Container.get<CacheImpl>("cache");