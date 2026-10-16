import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";

// 仿 pyq 首页置顶条：竖向「置顶」标签 + 横向缩略图，溢出时显示箭头。
export function PinnedBar() {
    const [items, setItems] = useState<any[]>([]);
    const trackRef = useRef<HTMLDivElement>(null);
    const [overflow, setOverflow] = useState(false);
    useEffect(() => {
        client.feed.index.get({
            query: { page: 1, limit: 50, type: 'normal' },
            headers: headersWithAuth()
        }).then(({ data }) => {
            if (data && typeof data !== 'string') {
                setItems((data.data || []).filter((f: any) => f.top === 1).slice(0, 10));
            }
        });
    }, []);
    useEffect(() => {
        const el = trackRef.current;
        if (!el) return;
        const check = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
        check();
        window.addEventListener("resize", check);
        return () => window.removeEventListener("resize", check);
    }, [items]);
    if (!items.length) return null;
    return (
        <div className={`pyq-pinned-bar${overflow ? " has-overflow" : ""}`}>
            <span className="pyq-pinned-label">置顶</span>
            <div className="pyq-pinned-track" ref={trackRef}>
                {items.map((f) => (
                    <Link className="pyq-pinned-item" href={`/feed/${f.id}`} key={f.id} title={f.title}>
                        {f.avatar
                            ? <img src={f.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" />
                            : <span className="pyq-pinned-ph">🖼️</span>}
                    </Link>
                ))}
            </div>
            <Link className="pyq-pinned-arrow" href="/pinned" title="全部置顶">›</Link>
        </div>
    );
}
