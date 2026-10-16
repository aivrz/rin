import { useEffect, useState } from "react";
import { Link } from "wouter";
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";

// 仿 pyq 首页置顶条：横向缩略图，点击进入文章；右侧箭头跳转 /pinned。
export function PinnedBar() {
    const [items, setItems] = useState<any[]>([]);
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
    if (!items.length) return null;
    return (
        <div className="pyq-pinned-bar">
            <span className="pyq-pinned-label">置顶</span>
            <div className="pyq-pinned-track">
                {items.map((f) => (
                    <Link className="pyq-pinned-item" href={`/feed/${f.id}`} key={f.id} title={f.title}>
                        {f.avatar
                            ? <img src={f.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" />
                            : <span className="pyq-pinned-ph">🖼️</span>}
                    </Link>
                ))}
            </div>
            <Link className="pyq-pinned-arrow" href="/pinned" title="全部置顶">→</Link>
        </div>
    );
}
