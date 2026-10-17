import { useEffect } from "react";
import { useMusic, loadMusic, togglePlay, nextSong, prevSong } from "../state/music";

// 顶栏单行音乐播放器：消费全局 MusicStore，音频元素挂在模块单例上，跨路由不中断。
export function TopMusicPlayer() {
    const m = useMusic();
    useEffect(() => {
        loadMusic();
    }, []);

    const cur = m.list[m.current];
    const ready = m.status === "ready" && m.list.length > 0;

    if (ready) {
        return (
            <div className="pyq-mini-player">
                <button className="pyq-mini-btn" aria-label="上一首" title="上一首" onClick={prevSong}>
                    <i className="ri-skip-back-line" />
                </button>
                <button className="pyq-mini-btn pyq-mini-play" aria-label="播放/暂停" title="播放/暂停" onClick={togglePlay}>
                    <i className={m.playing ? "ri-pause-fill" : "ri-play-fill"} />
                </button>
                <button className="pyq-mini-btn" aria-label="下一首" title="下一首" onClick={nextSong}>
                    <i className="ri-skip-forward-line" />
                </button>
                <div className="pyq-mini-meta">
                    <span className={"pyq-mini-title" + (m.playing ? " is-playing" : "")}>
                        {cur?.cover
                            ? <img className="pyq-mini-cover" src={cur.cover} alt="" referrerPolicy="no-referrer" />
                            : <i className="ri-music-2-line pyq-mini-nocover" />}
                        <span className="pyq-mini-text">{cur ? `${cur.name} - ${cur.artist || "未知歌手"}` : "未播放"}</span>
                    </span>
                </div>
            </div>
        );
    }

    const hint =
        m.status === "loading" ? "加载中…"
            : m.status === "empty" ? "未配置背景音乐"
                : "暂不支持该平台";

    return (
        <div className="pyq-mini-player">
            <button className="pyq-mini-btn pyq-mini-play" aria-label="背景音乐" title="背景音乐" disabled>
                <i className="ri-music-2-line" />
            </button>
            <div className="pyq-mini-meta">
                <span className="pyq-mini-title pyq-mini-hint">{hint}</span>
            </div>
        </div>
    );
}
