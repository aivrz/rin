import { useState } from "react";
import { Link } from "wouter";
import { Menu, Music, ArrowUp, X } from "lucide-react";

// 仿 pyq 右下角悬浮菜单 + 全局音乐播放器。
export function PyqFloat() {
    const [open, setOpen] = useState(false);
    const [player, setPlayer] = useState(false);
    const musicUrl = process.env.MUSIC_URL || "";
    const links = [
        { href: "/nav", label: "导航" },
        { href: "/timeline", label: "归档" },
        { href: "/friends", label: "友链" },
        { href: "/hashtags", label: "标签" },
        { href: "/pinned", label: "置顶" },
    ];
    function toTop() {
        window.scrollTo({ top: 0, behavior: "smooth" });
        setOpen(false);
    }
    return (
        <>
            {open &&
                <div className="pyq-menu-panel">
                    <div className="pyq-menu-panel-inner">
                        {links.map((l) => (
                            <Link key={l.href} href={l.href} className="pyq-menu-panel-item" onClick={() => setOpen(false)}>
                                {l.label}
                            </Link>
                        ))}
                        <button className="pyq-menu-panel-item" onClick={toTop}>回到顶部</button>
                    </div>
                </div>}
            <div className="pyq-menu">
                <button className="pyq-menu-k" aria-label="音乐" title="背景音乐" onClick={() => setPlayer(v => !v)}>
                    <Music />
                </button>
                <button className="pyq-menu-k" aria-label="菜单" title="菜单" onClick={() => setOpen(v => !v)}>
                    {open ? <X /> : <Menu />}
                </button>
            </div>
            {player &&
                <div className="pyq-float-player" style={{ display: "block" }}>
                    <div className="pyq-float-cover" />
                    <div className="pyq-float-bar">
                        <div className="pyq-float-bar-bg" />
                        <div className="pyq-float-bar-glass pyq-float-bar-inner">
                            {musicUrl
                                ? <audio src={musicUrl} controls autoPlay style={{ width: "100%" }} />
                                : <span style={{ fontSize: 12, color: "var(--texths)" }}>未配置背景音乐</span>}
                        </div>
                    </div>
                </div>}
        </>
    );
}
