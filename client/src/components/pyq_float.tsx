import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { client } from "../main";

type Song = { name: string; artist?: string; url: string; cover?: string };
type MusicConf = { name?: string; list: Song[] };

const links = [
    { href: "/nav", label: "导航" },
    { href: "/timeline", label: "归档" },
    { href: "/friends", label: "友链" },
    { href: "/hashtags", label: "标签" },
    { href: "/pinned", label: "置顶" },
];

// 仿 pyq 右下角悬浮菜单 + 全局音乐播放器（播放列表来自后端设置 music）
export function PyqFloat() {
    const [open, setOpen] = useState(false);
    const [player, setPlayer] = useState(false);
    const [music, setMusic] = useState<MusicConf | null>(null);
    const [loading, setLoading] = useState(false);
    const [current, setCurrent] = useState(0);
    const [playing, setPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);

    // 打开播放器时拉取后端配置的音乐播放列表
    useEffect(() => {
        if (!player || music) return;
        setLoading(true);
        client.config({ type: 'client' }).get().then(({ data }) => {
            if (data && typeof data !== 'string' && data.music) {
                try {
                    setMusic(JSON.parse(data.music));
                } catch {
                    // 配置格式错误时忽略，保持未配置状态
                }
            }
        }).catch(() => {
            // 拉取失败不影响其他功能
        }).finally(() => setLoading(false));
    }, [player]);

    // 根据播放状态与当前曲目控制 audio
    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;
        if (playing) a.play().catch(() => setPlaying(false));
        else a.pause();
    }, [playing, current]);

    function play(i: number) {
        setCurrent(i);
        setPlaying(true);
    }
    function toggle() {
        if (!music?.list?.length) return;
        setPlaying(v => !v);
    }
    function next() {
        if (!music?.list?.length) return;
        setCurrent(c => (c + 1) % music.list.length);
        setPlaying(true);
    }
    function prev() {
        if (!music?.list?.length) return;
        setCurrent(c => (c - 1 + music.list.length) % music.list.length);
        setPlaying(true);
    }

    const songs = music?.list || [];
    const cur = songs[current];

    return (
        <>
            {open &&
                <div className="pyq-menu-panel" onClick={() => setOpen(false)}>
                    <div className="pyq-menu-panel-inner" onClick={e => e.stopPropagation()}>
                        {links.map((l) => (
                            <Link key={l.href} href={l.href} className="pyq-menu-panel-item" onClick={() => setOpen(false)}>
                                {l.label}
                            </Link>
                        ))}
                        <button className="pyq-menu-panel-item" onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setOpen(false); }}>回到顶部</button>
                    </div>
                </div>}
            <div className="pyq-menu">
                <button className="pyq-menu-k" aria-label="音乐" title="背景音乐" onClick={() => setPlayer(v => !v)}>
                    <i className="ri-music-2-line" />
                </button>
                <button className="pyq-menu-k" aria-label="菜单" title="菜单" onClick={() => setOpen(v => !v)}>
                    {open ? <i className="ri-close-line" /> : <i className="ri-menu-line" />}
                </button>
            </div>
            {player &&
                <div className="pyq-float-player">
                    <div className="pyq-music-head">
                        <div>
                            <div className="pyq-music-name">{music?.name || "背景音乐"}</div>
                            <div className="pyq-music-sub">{songs.length} 首</div>
                        </div>
                        <button className="pyq-music-close" aria-label="关闭" onClick={() => setPlayer(false)}><i className="ri-close-line" /></button>
                    </div>
                    <div className="pyq-music-list">
                        {songs.length === 0
                            ? <div className="pyq-music-empty">{loading ? "加载中…" : "未配置背景音乐"}</div>
                            : songs.map((s, i) => (
                                <div key={i} className={"pyq-music-item" + (i === current ? " active" : "")} onClick={() => play(i)}>
                                    {s.cover
                                        ? <img className="pyq-music-cover" src={s.cover} alt="" referrerPolicy="no-referrer" />
                                        : <div className="pyq-music-cover pyq-music-cover-empty"><i className="ri-music-2-line" /></div>}
                                    <div className="pyq-music-meta">
                                        <div className="pyq-music-title">{s.name}</div>
                                        <div className="pyq-music-artist">{s.artist || "未知歌手"}</div>
                                    </div>
                                    {i === current && playing && <i className="ri-volume-up-line pyq-music-playing" />}
                                </div>
                            ))}
                    </div>
                    <div className="pyq-music-bar">
                        <button aria-label="上一首" onClick={prev}><i className="ri-skip-back-line" /></button>
                        <button className="pyq-music-play" aria-label="播放/暂停" onClick={toggle}><i className={playing ? "ri-pause-fill" : "ri-play-fill"} /></button>
                        <button aria-label="下一首" onClick={next}><i className="ri-skip-forward-line" /></button>
                        <span className="pyq-music-now">{cur?.name || "未播放"}</span>
                    </div>
                    <audio ref={audioRef} src={cur?.url} onEnded={next} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
                </div>}
        </>
    );
}
