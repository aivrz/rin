import { useEffect } from "react";
import { useMusic, loadMusic, subscribeMusic, togglePlay, nextSong, prevSong } from "../state/music";

// 顶栏单行音乐播放器：消费全局 MusicStore，音频元素挂在模块单例上，跨路由不中断。
export function TopMusicPlayer() {
    const m = useMusic();
    useEffect(() => {
        loadMusic();
        // 监听配置变化：后台保存/清空 music 后无需刷新页面即可生效
        return subscribeMusic();
    }, []);

    const cur = m.list[m.current];
    const ready = m.status === "ready" && m.list.length > 0;

    if (ready) {
        return (
            <div className="pyq-mini-player">
                <button className="pyq-mini-btn" aria-label="上一首" title="上一首" onClick={prevSong}>
                    <i className="ri-skip-back-line" />
                </button>
                <button className="pyq-mini-btn pyq-mini-play pyq-mini-lead" aria-label="播放/暂停" title="播放/暂停" onClick={togglePlay}>
                    <i className={m.playing ? "ri-pause-fill" : "ri-play-fill"} />
                </button>
                <button className="pyq-mini-btn" aria-label="下一首" title="下一首" onClick={nextSong}>
                    <i className="ri-skip-forward-line" />
                </button>
                <div className="pyq-mini-meta">
                    <span className={"pyq-mini-title" + (m.playing ? " is-playing" : "")}>
                        <i className="ri-music-2-line pyq-mini-nocover" />
                        {/* 播放失败时用真实原因替代歌名：否则表现为「有歌名却没声音」，无从判断是加载失败还是被浏览器拦截 */}
                        <span className="pyq-mini-text" title={m.reason || undefined}>
                            {m.reason
                                ? `⚠ ${m.reason}`
                                : cur ? `${cur.name} - ${cur.artist || "未知歌手"}` : "未播放"}
                        </span>
                    </span>
                </div>
            </div>
        );
    }

    // 有真实失败原因时优先展示它。「暂不支持该平台」是误导性的说法：
    // 平台是支持的，通常是上游 Meting 公益实例域名失效（ENOTFOUND）之类的外部故障。
    const hint =
        m.status === "loading" ? "加载中…"
            : m.status === "empty" ? "未配置背景音乐"
                : m.reason ? `不可用：${m.reason}` : "暂不支持该平台";

    // 失败原因可能较长，悬停可看全；title 也让读屏软件能读到当前状态
    return (
        <div className="pyq-mini-player">
            <button className="pyq-mini-btn pyq-mini-lead" aria-label="背景音乐" title={hint} disabled>
                <i className="ri-music-2-line" />
            </button>
            <div className="pyq-mini-meta">
                <span className="pyq-mini-title pyq-mini-hint">{hint}</span>
            </div>
        </div>
    );
}
