import { and, eq, ne, sql } from "drizzle-orm";
import Container from "typedi";
import type { DB } from "../_worker";
import { info } from "../db/schema";
import { CacheImpl } from "./cache";
import { getDB } from "./di";

/**
 * 站点配置存储：落在 D1 `info` 表，每个配置键一行。
 *
 * 为什么不再用 CacheImpl（S3 整份 JSON）：
 * CacheImpl 的写入语义是「把内存 Map 整体 PUT 回对象存储」。配置读路径（feed 详情、
 * 友链申请、cron）历史上用 getOrDefault 读配置，未命中时会顺带把当前内存快照整体写回，
 * 于是「某次读操作」会把管理员刚保存、但不在该快照里的键（典型：music）一并抹掉，
 * 表现为「保存返回成功、刷新后配置消失」。D1 按行 upsert 在物理上不可能覆盖其它键，
 * 且 getOrDefault 改为纯读（未命中只回默认值、绝不落盘），根因被彻底消除。
 *
 * 存储职责分层：
 *   - ConfigStore（本文，D1）：用户配置，不可丢，单键独立可覆盖
 *   - CacheImpl（S3）：高频可重建的公共缓存（feed 列表、sitemap、RSS/SEO 缓存）
 *
 * 对外方法名与 CacheImpl 保持一致，使 ServerConfig()/ClientConfig() 的全部业务读点
 * （cdn / wechat / oauth / friends / comments）无需任何改动。
 */

/** 迁移哨兵行键（存于 prefix 之下，加载时识别、all() 输出时过滤） */
const MIGRATED_KEY = "__migrated";

function encodeValue(value: any): string {
    try {
        const json = JSON.stringify(value);
        return json === undefined ? "null" : json;
    } catch {
        // 循环引用等无法序列化的值：退化为字符串，至少不丢内容
        return JSON.stringify(String(value));
    }
}

function decodeValue(raw: string): any {
    try {
        return JSON.parse(raw);
    } catch {
        // 兼容人工写入 / 历史遗留的非 JSON 文本
        return raw;
    }
}

export class ConfigStore {
    /** 容器注册名沿用旧值：'client.config' | 'server.config'（同时决定旧 S3 文件名） */
    readonly type: string;
    /** 命名空间：'client' | 'server' */
    readonly scope: string;
    /** 行键前缀：config:{scope}: */
    readonly prefix: string;
    private cache: Map<string, any> = new Map<string, any>();
    private loaded: boolean = false;
    private loading?: Promise<void>;
    private db: DB;

    constructor(type: string = "client.config") {
        this.type = type;
        this.scope = type.replace(/\.config$/, "");
        this.prefix = `config:${this.scope}:`;
        this.db = getDB();
    }

    /** 转义 LIKE 元字符（配置键含 `_`，如 qq_appid / counter.enabled，不转义会误匹配） */
    private keyPattern(prefix: string) {
        const escaped = (this.prefix + prefix).replace(/([\\%_])/g, "\\$1");
        return sql`${info.key} LIKE ${escaped + "%"} ESCAPE '\\'`;
    }

    /**
     * 首次加载后把旧 S3 `{type}.json` 里的配置惰性导入 D1。
     * 不写一次性脚本，存量部署升级后首次访问即透明完成；已有键不覆盖，避免旧数据冲掉新数据。
     */
    private async migrateLegacy(): Promise<void> {
        try {
            const legacy = new CacheImpl(this.type);
            const data = await legacy.all();
            let imported = 0;
            for (const [key, value] of data) {
                if (key === MIGRATED_KEY || this.cache.has(key)) continue;
                await this.writeRow(key, value, true);
                imported++;
            }
            // 无论是否导入到内容都要打标记：否则每次 isolate 冷启动都会重读一次 S3
            await this.writeRow(MIGRATED_KEY, 1, true);
            if (imported > 0) {
                console.log(`Config migrated to D1 (${this.scope}, ${imported} keys)`);
            }
        } catch (e: any) {
            // 迁移失败不阻塞配置读取：继续用默认值，后续保存仍可正常写入 D1
            console.error('Config legacy migration failed', this.type, e?.message ?? e);
        }
    }

    private async doLoad(): Promise<void> {
        const rows = await this.db
            .select()
            .from(info)
            .where(this.keyPattern(""));
        for (const row of rows) {
            this.cache.set(row.key.slice(this.prefix.length), decodeValue(row.value));
        }
        this.loaded = true;
        console.log('Config loaded', this.type, rows.length);
        if (!this.cache.has(MIGRATED_KEY)) {
            await this.migrateLegacy();
        }
    }

    private async ensure(): Promise<void> {
        if (this.loaded) return;
        if (!this.loading) {
            this.loading = this.doLoad().finally(() => { this.loading = undefined; });
        }
        try {
            await this.loading;
        } catch (e: any) {
            // 读取失败不置 loaded，下次访问重试。map 可能不完整，但配置写入是按行 upsert，
            // 残缺快照无法覆盖任何已存键（这正是迁移到 D1 带来的核心收益）。
            console.error('Config load failed', this.type, e?.message ?? e);
        }
    }

    /** 写库成功后同步内存，保证内存永远是「最后一次成功写入」的状态 */
    private async writeRow(key: string, value: any, ifAbsent: boolean): Promise<void> {
        const encoded = encodeValue(value);
        const values = { key: this.prefix + key, value: encoded };
        if (ifAbsent) {
            await this.db.insert(info).values(values).onConflictDoNothing();
        } else {
            await this.db
                .insert(info)
                .values(values)
                .onConflictDoUpdate({ target: info.key, set: { value: encoded } });
        }
        this.cache.set(key, value);
    }

    async all(): Promise<Map<string, any>> {
        await this.ensure();
        const out = new Map<string, any>();
        for (const [key, value] of this.cache) {
            if (key !== MIGRATED_KEY) out.set(key, value);
        }
        return out;
    }

    async get(key: string): Promise<any> {
        await this.ensure();
        return this.cache.get(key);
    }

    /**
     * 纯读兜底：未命中只返回默认值，绝不落盘。
     * 旧实现会「读到缺失就写回整份快照」，正是配置被静默抹除的根因。
     */
    async getOrDefault<T>(key: string, defaultValue: T): Promise<T> {
        await this.ensure();
        const value = this.cache.get(key);
        return value === undefined ? defaultValue : (value as T);
    }

    /** @returns true 已落库；false DB 写入失败（内存与 DB 均保持旧值） */
    async set(key: string, value: any): Promise<boolean> {
        await this.ensure();
        try {
            await this.writeRow(key, value, false);
            return true;
        } catch (e: any) {
            console.error('Config set failed', this.type, key, e?.message ?? e);
            return false;
        }
    }

    async delete(key: string): Promise<boolean> {
        try {
            await this.db.delete(info).where(eq(info.key, this.prefix + key));
            this.cache.delete(key);
            return true;
        } catch (e: any) {
            console.error('Config delete failed', this.type, key, e?.message ?? e);
            return false;
        }
    }

    async deletePrefix(prefix: string): Promise<boolean> {
        try {
            await this.db.delete(info).where(this.keyPattern(prefix));
            for (const key of [...this.cache.keys()]) {
                if (key.startsWith(prefix)) this.cache.delete(key);
            }
            return true;
        } catch (e: any) {
            console.error('Config deletePrefix failed', this.type, prefix, e?.message ?? e);
            return false;
        }
    }

    /** 保留迁移哨兵：否则新 isolate 会再次从仍在 S3 上的旧文件把配置导回来 */
    async clear(): Promise<boolean> {
        try {
            await this.db
                .delete(info)
                .where(and(this.keyPattern(""), ne(info.key, this.prefix + MIGRATED_KEY)));
            for (const key of [...this.cache.keys()]) {
                if (key !== MIGRATED_KEY) this.cache.delete(key);
            }
            await this.writeRow(MIGRATED_KEY, 1, false);
            return true;
        } catch (e: any) {
            console.error('Config clear failed', this.type, e?.message ?? e);
            return false;
        }
    }

    /** 兼容保留：配置写入是逐行即时的，没有「批量保存」概念 */
    async save(): Promise<boolean> {
        return true;
    }
}

export const ServerConfig = () => Container.get<ConfigStore>("server.config");
export const ClientConfig = () => Container.get<ConfigStore>("client.config");