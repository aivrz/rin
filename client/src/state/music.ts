import { useSyncExternalStore } from "react";
import { client, endpoint } from "../main";

export type Song = { id: string; name: string; artist: string; cover?: string };

export type MusicStatus = "idle" | "loading" | "ready" | "empty" | "unsupported";

export interface MusicState {
    status: MusicStatus;
    name?: string;
    list: Song[];
    current: number;
    playing: boolean;
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
    audio.addEventListener("play", () => setState({ playing: true }));
    audio.addEventListener("pause", () => setState({ playing: false }));
}

// 读取客户端配置中的歌单链接，并（在后端代理启用时）解析为可播放列表
export async function loadMusic() {
    // 已就绪/加载中/明确未配置 时跳过；unsupported（后端暂不可用）允许 remount 时重试，便于后端上线后无需强刷即生效
    if (state.status === "ready" || state.status === "loading" || state.status === "empty") return;
    setState({ status: "loading" });
    try {
        const { data } = await client.config({ type: "client" }).get();
        const link = data && typeof data !== "string" ? (data.music as string | undefined) : undefined;
        if (!link) {
            setState({ status: "empty" });
            return;
        }
        try {
            const r = await fetch(`${endpoint}/music/netease/playlist?url=${encodeURIComponent(link)}`);
            if (!r.ok) throw new Error("not implemented");
            const json = await r.json() as { name?: string; list?: Song[] };
            setState({
                name: json.name,
                list: (json.list || []) as Song[],
                status: "ready",
                current: 0,
            });
        } catch {
            // 后端网易云代理尚未启用（安全闸）：优雅降级
            setState({ status: "unsupported" });
        }
    } catch {
        setState({ status: "unsupported" });
    }
}

export function playSong(i: number) {
    if (!audio || !state.list[i]) return;
    setState({ current: i });
    audio.src = `${endpoint}/music/netease/url/${state.list[i].id}`;
    audio.play().catch(() => { /* 自动播放被拦截或后端未启用 */ });
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
