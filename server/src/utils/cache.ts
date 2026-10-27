import path from "path";
import Container, { Service } from "typedi";
import type { DB } from "../_worker";
import type { Env } from "../db/db";
import { getDB, getEnv } from "./di";

// 公共缓存：承载高频可重建数据（feed 列表、sitemap、RSS/SEO 缓存）。
// DO NOT USE THIS TO STORE SENSITIVE DATA，也**不可**用于站点配置（见 config-store.ts）。
//
// 存储策略：每个逻辑 key 对应一个独立 R2 对象（cache/<type>/<key>.json），
// 而非早期「整份 Map 写进单个 JSON」的方案。好处：
//   - set 只写单个对象，避免每次缓存写入都重写整份快照（旧方案在 feed 列表频繁回源时
//     会产生大量 R2 Class A 写操作，徒增成本）；
//   - deletePrefix / clear 直接用 R2 原生的 list({prefix}) + delete 完成，无需遍历内存再整体回写；
//   - 实例内存仍缓存已读过的 key，同实例内重复读取零 R2 操作。
// 站点配置请走 utils/config-store.ts（落 D1，逐键 upsert），不要放进这里。

@Service()
export class CacheImpl {
    cache: Map<string, any> = new Map<string, any>();
    db: DB;
    env: Env;
    cacheFolder: string;
    type: string;

    constructor(type: string = "cache") {
        this.type = type;
        this.db = getDB();
        this.env = getEnv();
        // S3_CACHE_FOLDER 在 docs/ENV.md 中标注为可选（默认 cache/），在此归一：
        // 读、写、列举共用同一目录，避免空串时写入 R2 根目录或 path.join 异常。
        this.cacheFolder = this.env.S3_CACHE_FOLDER || 'cache';
    }

    private basePrefix() {
        return path.join(this.cacheFolder, this.type) + '/';
    }

    private objectKey(key: string) {
        return path.join(this.cacheFolder, this.type, `${key}.json`);
    }

    private keyFromObject(objKey: string): string | undefined {
        const base = this.basePrefix();
        if (!objKey.startsWith(base)) return undefined;
        return objKey.slice(base.length, objKey.endsWith('.json') ? -'.json'.length : undefined);
    }

    private async readObject(key: string): Promise<any> {
        const objKey = this.objectKey(key);
        try {
            const obj = await this.env.RIN_BUCKET.get(objKey);
            if (obj) return JSON.parse(await obj.text());
        } catch (e: any) {
            console.warn('Cache r2 get failed, fallback', objKey, e?.message);
        }
        // 回退：经 S3_ACCESS_HOST 公共地址读取（兼容 bucket 路径不一致的部署）
        try {
            const slash = this.env.S3_ACCESS_HOST.endsWith('/') ? '' : '/';
            const res = await fetch(new Request(this.env.S3_ACCESS_HOST + slash + objKey));
            if (res.ok) return await res.json();
        } catch (e: any) {
            console.warn('Cache public get failed', objKey, e?.message);
        }
        return undefined;
    }

    private async writeObject(key: string, value: any): Promise<boolean> {
        const objKey = this.objectKey(key);
        try {
            await this.env.RIN_BUCKET.put(objKey, JSON.stringify(value), {
                httpMetadata: { contentType: 'application/json' }
            });
            return true;
        } catch (e: any) {
            console.error('Cache r2 put failed', objKey, e?.message);
            return false;
        }
    }

    private async deleteObjects(keys: string[]): Promise<void> {
        if (!keys.length) return;
        try {
            await this.env.RIN_BUCKET.delete(keys);
        } catch (e: any) {
            console.error('Cache r2 delete failed', keys, e?.message);
        }
    }

    private async listKeys(prefix: string): Promise<string[]> {
        const keys: string[] = [];
        let cursor: string | undefined;
        do {
            const r = await this.env.RIN_BUCKET.list({ prefix, cursor });
            for (const o of r.objects) keys.push(o.key);
            cursor = r.truncated ? r.cursor : undefined;
        } while (cursor);
        return keys;
    }

    async all() {
        return this.cache;
    }

    async get(key: string) {
        if (this.cache.has(key)) return this.cache.get(key);
        const v = await this.readObject(key);
        if (v !== undefined) this.cache.set(key, v);
        return v;
    }

    /**
     * 真缓存专用：未命中时计算并写回。
     * 注意语义差异——本方法只写单个 key 对象，因此**不得**用于「用户配置」：
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
        this.cache.set(key, value);
        if (save) await this.writeObject(key, value);
        return true;
    }

    async delete(key: string, save: boolean = true) {
        this.cache.delete(key);
        if (save) await this.deleteObjects([this.objectKey(key)]);
        return true;
    }

    async deletePrefix(prefix: string) {
        // 直接按前缀列举 R2 对象并删除（原生支持），再清掉内存中匹配项，无需先加载整份快照
        const keys = await this.listKeys(this.basePrefix() + prefix);
        for (const k of keys) {
            const name = this.keyFromObject(k);
            if (name && name.startsWith(prefix)) this.cache.delete(name);
        }
        await this.deleteObjects(keys);
        return true;
    }

    /** @returns true 已清空；false 异常 */
    async clear(): Promise<boolean> {
        const keys = await this.listKeys(this.basePrefix());
        for (const k of keys) {
            const name = this.keyFromObject(k);
            if (name) this.cache.delete(name);
        }
        // 清理早期单文件快照（cache/cache.json），避免孤儿对象长期残留
        await this.deleteObjects([path.join(this.cacheFolder, `${this.type}.json`)]);
        return true;
    }
}

/**
 * 公共缓存：承载高频可重建数据（feed 列表、sitemap、RSS/SEO 缓存）。
 * DO NOT USE THIS TO STORE SENSITIVE DATA，也**不可**用于站点配置（见 config-store.ts）。
 */
export const PublicCache = () => Container.get<CacheImpl>("cache");
