import { createContext, useSyncExternalStore } from "react";
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";

const defaultFavicon = process.env.AVATAR ? `//wsrv.nl/?url=${encodeURIComponent(process.env.AVATAR)}&w=144&h=144&mask=circle` : '/favicon.ico';
export const defaultClientConfig = new Map(Object.entries({
    "favicon": defaultFavicon,
    "counter.enabled": true,
    "friend_apply_enable": true,
    "comment.enabled": true,
    "login.enabled": true,
}))

export const defaultServerConfig = new Map(Object.entries({
    "friend_crontab": true,
    "friend_ua": "Rin-Check/0.1.0"
}))

export class ConfigWrapper {
    config: any;
    defaultConfig: Map<string, any>
    constructor(config: any, defaultConfig: Map<string, any>) {
        this.config = config;
        this.defaultConfig = defaultConfig;
    }
    get<T>(key: string) {
        // 以「键是否存在」判定，而非「值是否为空」：
        // 管理员主动清空 footer / music / friend_ua 后存的是空串，
        // 旧实现把空串当未配置并回落默认值，回显空白容易被误判成「保存失败」而反复保存。
        // 现在键存在即返回真实值（含空串），仅键缺失才回落默认值。
        if (this.config && Object.prototype.hasOwnProperty.call(this.config, key)) {
            return this.config[key] as T;
        }
        if (this.defaultConfig.has(key)) {
            return this.defaultConfig.get(key) as T;
        }
    }
    default<T>(key: string) {
        return this.defaultConfig.get(key) as T;
    }
}

export const defaultClientConfigWrapper = new ConfigWrapper({}, defaultClientConfig);
export const defaultServerConfigWrapper = new ConfigWrapper({}, defaultServerConfig);

export const ClientConfigContext = createContext<ConfigWrapper>(defaultClientConfigWrapper);
export const ServerConfigContext = createContext<ConfigWrapper>(defaultServerConfigWrapper);

/* ---------------------------------------------------------------------------
 * 全局配置 store（模块级单例 + useSyncExternalStore，参见 state/music.ts）
 *
 * 为什么要 store 而不是各页面 useState：设置页保存成功后原先只写 sessionStorage，
 * 而 App 层与设置页各自持有独立副本，导致「保存成功但界面毫无变化」，必须 F5。
 * 统一为唯一数据源后，保存即 emit()，favicon / 页脚 / 各开关立即重渲染。
 * --------------------------------------------------------------------------- */

const SESSION_KEY = 'config';

const listeners = new Set<() => void>();
function emit() {
    for (const l of listeners) l();
}
function subscribe(cb: () => void) {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
}

function readSession(): any {
    if (typeof sessionStorage === 'undefined') return {};
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e: any) {
        console.warn('Config session cache unreadable', e?.message ?? e);
        return {};
    }
}

function writeSession(config: any) {
    if (typeof sessionStorage === 'undefined') return;
    try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(config));
    } catch (e: any) {
        console.warn('Config session cache write failed', e?.message ?? e);
    }
}

/** 首帧即可用 sessionStorage 缓存同步渲染（秒开），随后由 loadClientConfig 后台校验最新值 */
let clientSnapshot = new ConfigWrapper(readSession(), defaultClientConfig);
/** server 配置含 AppSecret / Token，只在内存保存，不落 sessionStorage */
let serverSnapshot = new ConfigWrapper({}, defaultServerConfig);

let clientLoaded = false;
let clientLoading?: Promise<void>;
let serverLoaded = false;
let serverLoading?: Promise<void>;

function replaceClientConfig(config: any) {
    clientSnapshot = new ConfigWrapper(config, defaultClientConfig);
    writeSession(config);
    emit();
}

function replaceServerConfig(config: any) {
    serverSnapshot = new ConfigWrapper(config, defaultServerConfig);
    emit();
}

function getClientSnapshot() {
    return clientSnapshot;
}

function getServerSnapshot() {
    return serverSnapshot;
}

/** 非 hook 的快照读取（供模块级逻辑使用，如播放器） */
export function getClientConfigSnapshot(): ConfigWrapper {
    return clientSnapshot;
}

/** 订阅任意配置变更，返回取消订阅函数 */
export function subscribeConfig(cb: () => void): () => void {
    return subscribe(cb);
}

/** 拉取服务端配置校验本地快照；失败时保留本地值，绝不用残缺数据覆盖既有配置 */
export async function loadClientConfig(force: boolean = false): Promise<void> {
    if (clientLoaded && !force) return;
    if (clientLoading && !force) return clientLoading;
    const task = (async () => {
        try {
            const { data } = await client.config({ type: "client" }).get();
            if (data && typeof data !== 'string') {
                clientLoaded = true;
                replaceClientConfig(data);
            }
        } catch (e: any) {
            console.warn('Config client load failed', e?.message ?? e);
        }
    })();
    clientLoading = task;
    try {
        await task;
    } finally {
        clientLoading = undefined;
    }
}

export async function loadServerConfig(force: boolean = false): Promise<void> {
    if (serverLoaded && !force) return;
    if (serverLoading && !force) return serverLoading;
    const task = (async () => {
        try {
            const { data } = await client.config({ type: "server" }).get({ headers: headersWithAuth() });
            if (data && typeof data !== 'string') {
                serverLoaded = true;
                replaceServerConfig(data);
            }
        } catch (e: any) {
            console.warn('Config server load failed', e?.message ?? e);
        }
    })();
    serverLoading = task;
    try {
        await task;
    } finally {
        serverLoading = undefined;
    }
}

/** 保存成功后调用：更新内存快照 + 同步 sessionStorage + 通知订阅者 → 立即生效，无需 F5 */
export function setClientConfigValue(key: string, value: any) {
    replaceClientConfig({ ...(clientSnapshot.config || {}), [key]: value });
}

export function setServerConfigValue(key: string, value: any) {
    replaceServerConfig({ ...(serverSnapshot.config || {}), [key]: value });
}

export function useClientConfig(): ConfigWrapper {
    return useSyncExternalStore(subscribe, getClientSnapshot);
}

export function useServerConfig(): ConfigWrapper {
    return useSyncExternalStore(subscribe, getServerSnapshot);
}