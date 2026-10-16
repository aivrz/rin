import { Link } from "wouter";
import { PyqCoverHeader } from "../components/pyq_cover";
import { Seo } from "../components/seo";

// 仿 pyq 全站导航页：站点资料 + 快捷入口（弥补朋友圈布局难以触达分类/页面的痛点）。
export function NavPage() {
    const links = [
        { href: "/", label: "全部动态", icon: "ri-home-4-line" },
        { href: "/hashtags", label: "标签广场", icon: "ri-hashtag" },
        { href: "/friends", label: "友情链接", icon: "ri-global-line" },
        { href: "/timeline", label: "时间轴", icon: "ri-calendar-line" },
    ];
    return (
        <main className="pyq-main">
            <Seo title="全站导航" description="站点导航：全部动态、标签广场、友情链接与时间轴。" />
            <PyqCoverHeader />
            <div className="pyq-nrbk">
                <div className="pyq-card">
                    <p style={{ color: "var(--textqh)", fontWeight: 700, fontSize: 16, marginBottom: 8 }}>全站导航</p>
                    <div className="flex flex-col">
                        {links.map((l) => (
                            <Link key={l.href} href={l.href}
                                className="flex flex-row items-center gap-3 py-3 border-b"
                                style={{ borderColor: "var(--fgxys)", color: "var(--textqh)" }}>
                                <i className={l.icon} style={{ fontSize: 18 }} />
                                <span>{l.label}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    );
}
