import { Link } from "wouter";
import { PyqCoverHeader } from "../components/pyq_cover";

// 仿 pyq 全站导航页：站点资料 + 快捷入口（弥补朋友圈布局难以触达分类/页面的痛点）。
export function NavPage() {
    const links = [
        { href: "/", label: "全部动态", icon: "🏠" },
        { href: "/hashtags", label: "标签广场", icon: "#️⃣" },
        { href: "/friends", label: "友情链接", icon: "🌐" },
        { href: "/search/%E5%85%A8%E9%83%A8", label: "搜索", icon: "🔍" },
        { href: "/timeline", label: "时间轴", icon: "📅" },
    ];
    return (
        <main className="pyq-main">
            <PyqCoverHeader />
            <div className="pyq-nrbk">
                <div className="pyq-card">
                    <p style={{ color: "var(--textqh)", fontWeight: 700, fontSize: 16, marginBottom: 8 }}>全站导航</p>
                    <div className="flex flex-col">
                        {links.map((l) => (
                            <Link key={l.href} href={l.href}
                                className="flex flex-row items-center gap-3 py-3 border-b"
                                style={{ borderColor: "var(--fgxys)", color: "var(--textqh)" }}>
                                <span style={{ fontSize: 18 }}>{l.icon}</span>
                                <span>{l.label}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    );
}
