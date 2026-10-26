import Elysia, { t } from "elysia";
import { setup } from "../setup";
import { PublicCache } from "../utils/cache";
import { ClientConfig, ServerConfig } from "../utils/config-store";
import type { ConfigStore } from "../utils/config-store";

/**
 * 可写配置键白名单：覆盖后台设置页全部 21 项，另含 WEBHOOK_URL（仅代码读取，
 * 保留以兼容历史上通过本接口写入的部署）。
 * 白名单之外的键一律拒绝：杜绝任意键写入，尤其是把私密值误塞进会被匿名公开的 client 命名空间。
 */
const CLIENT_KEYS = new Set([
    'favicon',            // 站点图标
    'footer',             // 页脚 HTML
    'music',              // 网易云歌单链接
    'rss',                // RSS 开关
    'login.enabled',      // 第三方登录开关
    'comment.enabled',    // 评论开关
    'counter.enabled',    // 访问计数开关
    'friend_apply_enable',// 友链申请开关
    'logo',               // 站点 logo（header / 封面头像，缺省回退 AVATAR）
    'banner',             // 站点顶部 banner（封面背景，缺省回退 AVATAR）
]);

const SERVER_KEYS = new Set([
    'friend_crontab',        // 友链健康检查定时任务开关
    'friend_ua',             // 友链健康检查 UA
    'cdn_host',              // CDN 域名（七牛镜像回源）
    'qq_appid', 'qq_appkey',
    'weibo_appkey', 'weibo_appsecret',
    'wechat_appid', 'wechat_appsecret',
    'ews_appid', 'ews_appsecret', 'ews_token', 'ews_qrcode_url',
    'WEBHOOK_URL',
]);

/**
 * 单值长度上限（UTF-16 码元数）。D1 单条 SQL 语句上限约 100KB，
 * 取 16384 即使全部为 4 字节字符（emoji）也仅约 64KB，留足余量；
 * 正常配置项（URL / AppSecret / 页脚 HTML）远小于此。
 */
const MAX_VALUE_LENGTH = 16 * 1024;

function isConfigType(type: string): type is 'client' | 'server' {
    return type === 'client' || type === 'server';
}

function storeOf(type: 'client' | 'server'): ConfigStore {
    return type === 'server' ? ServerConfig() : ClientConfig();
}

/** 设置页只会写入标量；对象/数组/超长值视为异常写入 */
function isAcceptableValue(value: any): boolean {
    if (value === null) return true;
    switch (typeof value) {
        case 'boolean': return true;
        case 'number': return Number.isFinite(value);
        case 'string': return value.length <= MAX_VALUE_LENGTH;
        default: return false;
    }
}

export function ConfigService() {
    return new Elysia({ aot: false })
        .use(setup())
        .group('/config', (group) =>
            group
                .get('/:type', async ({ set, admin, params: { type } }) => {
                    if (!isConfigType(type)) {
                        set.status = 400;
                        return 'Invalid type';
                    }
                    if (type === 'server' && !admin) {
                        set.status = 401;
                        return 'Unauthorized';
                    }
                    const all = await storeOf(type).all();
                    if (type === 'client') {
                        // 本接口匿名可读：只输出已知公开键，避免误存的私密值被公开
                        const safe: Record<string, any> = {};
                        for (const key of CLIENT_KEYS) {
                            if (all.has(key)) safe[key] = all.get(key);
                        }
                        return safe;
                    }
                    return Object.fromEntries(all);
                })
                .post('/:type', async ({ set, admin, body, params: { type } }) => {
                    if (!isConfigType(type)) {
                        set.status = 400;
                        return 'Invalid type';
                    }
                    if (!admin) {
                        set.status = 401;
                        return 'Unauthorized';
                    }
                    const entries = Object.entries(body ?? {});
                    if (entries.length === 0) {
                        set.status = 400;
                        return 'Empty body';
                    }
                    const allowed = type === 'server' ? SERVER_KEYS : CLIENT_KEYS;
                    const rejected = entries
                        .filter(([key, value]) => !allowed.has(key) || !isAcceptableValue(value))
                        .map(([key]) => key);
                    if (rejected.length > 0) {
                        set.status = 400;
                        return `Rejected keys: ${rejected.join(', ')}`;
                    }
                    // 逐键 upsert：单项写入互不影响，也不再有「整份覆盖」导致的
                    // 「保存了 A 却把 B 抹掉」。任一键落库失败即整体报错，避免部分成功
                    // 让界面显示与实际存储不一致。
                    const store = storeOf(type);
                    for (const [key, value] of entries) {
                        if (!await store.set(key, value)) {
                            console.error('Config persist failed', type, key);
                            set.status = 500;
                            return `Failed to persist config key: ${key}`;
                        }
                    }
                    return 'OK';
                }, {
                    body: t.Record(t.String(), t.Any())
                })
                .delete('/cache', async ({ set, admin }) => {
                    if (!admin) {
                        set.status = 401;
                        return 'Unauthorized';
                    }
                    if (!await PublicCache().clear()) {
                        console.error('Public cache clear failed');
                        set.status = 500;
                        return 'Failed to clear cache, check worker logs';
                    }
                    return 'OK';
                })
        )
}