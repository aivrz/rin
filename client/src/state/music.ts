import { useSyncExternalStore } from "react";
import { endpoint } from "../main";
import { getClientConfigSnapshot, loadClientConfig, subscribeConfig } from "./config";

// 极简风格：不带封面。少一次外部图片请求，也少一个第三方图床失效点。
export type Song = { id: string; name: string; artist: string };

export type MusicStatus = "idle" | "loading" | "ready" | "empty" | "unsupported";

export interface MusicState {
    status: MusicStatus;
    name?: string;
    list: Song[];
    current: number;
    playing: boolean;
    /** 失败/降级时的真实原因（如上游实例域名失效 ENOTFOUND），用于界面提示 */
    reason?: string;
}

// 模块级单例音频元素：不随路由切换（顶栏 remount）而重置，保证跨页面连续播放
const audio: HTMLAudioElement | null =
    typeof Audio !== "undefined" ? new Audio() : null;

let state: MusicState = { status: "idle", list: [], current: 0, playing: false };
const listeners = new Set<() => void>();

function emit() {
    for (const l of listeners) l();
}
function setState(patch: Partial<MusicState>) {
    state = { ...state, ...patch };
    emit();
}

if (audio) {
    audio.addEventListener("ended", () => nextSong());
    audio.addEventListener("play", () => setState({ playing: true, reason: undefined }));
    audio.addEventListener("pause", () => setState({ playing: false }));
    // 音频加载失败必须留下可见痕迹：此前 play().catch(() => {}) 把错误全吞了，
    // 表现为「点了没反应、也没声音」，完全无从排查
    // （无版权歌曲 url 为空、代理 404、Range 不被支持等都会走到这里）
    audio.addEventListener("error", () => {
        const code = audio.error?.code;
        const why = code === 4
            ? "音频地址无效或已失效"
            : code === 3
                ? "音频解码失败"
                : code === 2
                    ? "网络错误，音频拉取失败"
                    : "音频加载失败";
        setState({ playing: false, reason: why });
    });
}

// 歌单链接统一取自全局配置 store（不再单独请求 /config/client），
// 避免出现第二条配置通道 —— 那会导致保存 music 后播放器读的还是旧快照。
let musicLink: string | undefined;

function readMusicLink(): string | undefined {
    const link = getClientConfigSnapshot().get<string>("music");
    return link && link.trim() ? link.trim() : undefined;
}

/**
 * 本次加载是否已过期：加载期间若被 refreshMusic 重置（status 变回 idle），
 * 或 music 配置又变了，则丢弃本次结果，避免旧歌单覆盖刚保存的新配置。
 * 经函数读取 status 以打断 TS 对 state.status 的字面量收窄（跨 await 收窄会失真）。
 */
function isStaleLoad(link: string): boolean {
    return state.status !== "loading" || readMusicLink() !== link;
}

// 读取客户端配置中的歌单链接，并（在后端代理启用时）解析为可播放列表
export async function loadMusic() {
    // 已就绪/加载中/明确未配置 时跳过；unsupported（后端暂不可用）允许 remount 时重试，便于后端上线后无需强刷即生效
    if (state.status === "ready" || state.status === "loading" || state.status === "empty") return;
    setState({ status: "loading" });
    try {
        // 配置尚未就绪时先等一次（已加载或加载中都会复用同一请求），
        // 否则首帧可能把「还没拉到」误判成「未配置」而不再重试。
        await loadClientConfig();
        const link = readMusicLink();
        musicLink = link;
        if (!link) {
            setState({ status: "empty" });
            return;
        }
        try {
            const r = await fetch(`${endpoint}/music/netease/playlist?url=${encodeURIComponent(link)}`);
            if (!r.ok) {
                // 后端会把真实失败原因放在 detail（如上游 Meting 实例域名失效 ENOTFOUND），
                // 直接抛状态码只会得到一句无信息量的「暂不支持该平台」
                let detail = `HTTP ${r.status}`;
                try {
                    const body = await r.json() as { detail?: string };
                    if (body?.detail) detail = body.detail;
                } catch { /* 非 JSON 响应，保留状态码 */ }
                throw new Error(detail);
            }
            const json = await r.json() as { name?: string; list?: Song[] };
            if (isStaleLoad(link)) return;
            setState({
                name: json.name,
                list: (json.list || []) as Song[],
                status: "ready",
                current: 0,
            });
        } catch (e: any) {
            // 后端代理未启用 / 上游实例挂掉：优雅降级，并把原因带给界面
            if (isStaleLoad(link)) return;
            setState({ status: "unsupported", reason: e?.message || String(e) });
        }
    } catch {
        if (isStaleLoad("")) return;
        setState({ status: "unsupported", reason: "config load failed" });
    }
}

/**
 * 作废已解析的歌单并重新加载，播放器无需刷新页面即可生效。
 *
 * 必须由「改配置的一方」显式调用，不能只靠组件订阅：
 * 播放器组件 TopMusicPlayer 只在 pyq 页面挂载，而设置页走 RouteMe（只有 Header/Footer），
 * 两者不是同一棵树。管理员停在设置页保存 music 时订阅早已退订，
 * 只靠订阅会漏掉这次变更，返回首页后 loadMusic 又会因 status==="ready" 早退，导致旧歌单继续播放。
 */
export async function refreshMusic() {
    audio?.pause();
    state = { status: "idle", list: [], current: 0, playing: false };
    emit();
    await loadMusic();
}

/** 订阅配置变化（播放器已挂载时的兜底），返回取消订阅函数 */
export function subscribeMusic() {
    return subscribeConfig(() => {
        if (state.status === "loading") return;
        if (readMusicLink() === musicLink) return;
        void refreshMusic();
    });
}

export function playSong(i: number) {
    if (!audio || !state.list[i]) return;
    const song = state.list[i];
    setState({ current: i, reason: undefined });
    if (!song.id) {
        // 上游没能解析出歌曲 id（多见于无版权歌曲），直接给出原因而不是让请求打到一个空地址
        setState({ reason: "该歌曲缺少 id，无法播放" });
        return;
    }
    audio.src = `${endpoint}/music/netease/url/${song.id}`;
    audio.play().catch((e: any) => {
        setState({ playing: false, reason: e?.message || "播放被浏览器拦截" });
    });
}

export function togglePlay() {
    if (!audio || state.list.length === 0) return;
    if (state.playing) audio.pause();
    else if (audio.src) audio.play().catch(() => { });
    else playSong(state.current);
}

export function nextSong() {
    if (state.list.length === 0) return;
    playSong((state.current + 1) % state.list.length);
}

export function prevSong() {
    if (state.list.length === 0) return;
    playSong((state.current - 1 + state.list.length) % state.list.length);
}

function subscribe(cb: () => void) {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
}
function getSnapshot() {
    return state;
}

export function useMusic() {
    return useSyncExternalStore(subscribe, getSnapshot);
}
