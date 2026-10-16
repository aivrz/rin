import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Home, Search, User, Menu, X } from "lucide-react";
import { useLoginModal } from "../hooks/useLoginModal";
import { ClientConfigContext } from "../state/config";
import { useContext } from "react";
import { PyqFloat } from "./pyq_float";

// 仿 pyq 顶部封面 + 站点资料（头像 / 昵称 / 个签）+ 叠加在封面上的吸顶玻璃导航。
export function PyqCoverHeader() {
    const avatar = process.env.AVATAR || "";
    const name = process.env.NAME || "Rin";
    const desc = process.env.DESCRIPTION || "";
    const config = useContext(ClientConfigContext);
    const loginEnabled = config.get<boolean>('login.enabled');
    const { LoginModal, setIsOpened } = useLoginModal();
    const [searchOpen, setSearchOpen] = useState(false);
    const [keyword, setKeyword] = useState("");
    const [_, setLocation] = useLocation();

    useEffect(() => {
        const onScroll = () => {
            const el = document.documentElement;
            if (window.scrollY > 120) el.classList.add("pyq-topbar-scrolled");
            else el.classList.remove("pyq-topbar-scrolled");
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    function doSearch() {
        const k = keyword.trim();
        if (!k) return;
        setSearchOpen(false);
        setLocation(`/search/${encodeURIComponent(k)}`);
    }

    return (
        <div className="pyq-main-head">
            <div className="pyq-main-head-top">
                <div className="pyq-main-head-top-left">
                    <Link href="/" className="pyq-main-head-top-left-s" aria-label="首页" title="首页">
                        <Home />
                    </Link>
                </div>
                <div className="pyq-main-head-top-right">
                    <button className="pyq-main-head-top-right-s" aria-label="搜索" title="搜索" onClick={() => setSearchOpen(true)}>
                        <Search />
                    </button>
                    {loginEnabled &&
                        <button className="pyq-main-head-top-right-s" aria-label="登录" title="登录" onClick={() => setIsOpened(true)}>
                            <User />
                        </button>}
                    <Link href="/nav" className="pyq-main-head-top-right-s" aria-label="导航" title="全站导航">
                        <Menu />
                    </Link>
                </div>
            </div>
            <div
                className="pyq-main-head-img"
                style={{
                    backgroundImage: avatar
                        ? `linear-gradient(135deg, rgba(9,195,98,0.25), rgba(43,125,224,0.25)), url(${avatar})`
                        : "linear-gradient(135deg, #09c362, #2b7de0)",
                }}
            />
            <div className="pyq-main-head-headimg">
                <div className="pyq-main-head-headimg-tx">
                    <div className="pyq-main-head-headimg-info">
                        <h4>{name}</h4>
                        {desc && <p className="pyq-main-head-headimg-qm">{desc}</p>}
                    </div>
                    <Link href="/nav" title="全站导航">
                        {avatar
                            ? <img src={avatar} alt="头像" referrerPolicy="no-referrer" />
                            : <div style={{ width: 72, height: 72, borderRadius: 8, border: "3px solid var(--cobg)", background: "var(--imgbgy)" }} />}
                    </Link>
                </div>
            </div>

            {searchOpen &&
                <div className="pyq-search is-open" onClick={() => setSearchOpen(false)}>
                    <div className="pyq-search-main" onClick={(e) => e.stopPropagation()}>
                        <div className="pyq-search-main-top">
                            <div className="pyq-news-main-top-xiaoxih"><span>搜索文章</span></div>
                            <div className="pyq-news-main-top-div" onClick={() => setSearchOpen(false)}><X /></div>
                        </div>
                        <div className="pyq-search-input-wrap">
                            <input
                                autoFocus
                                value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
                                placeholder="输入关键词开始搜索"
                            />
                            <button onClick={doSearch}>搜索</button>
                        </div>
                    </div>
                </div>}

            <LoginModal />
            <PyqFloat />
        </div>
    );
}
