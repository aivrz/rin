import { useEffect, useState, useContext, useRef } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { timeago } from "../utils/timeago";
import { HashTag } from "./hashtag";
import { CommentModal } from "./comment_modal";
import { CommentItem } from "./comment_item";
import { buildCommentTree, FlatComment } from "../utils/commentTree";
import { useLike } from "../hooks/useLike";
import { useLoginModal } from "../hooks/useLoginModal";
import { usePrefetch, prefetchPage, prefetchFeedData, prefetchMarkdown } from "../hooks/usePrefetch";
import { ProfileContext } from "../state/profile";
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";

function stripMdImages(text: string): string {
    return text.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function gridClass(n: number): string {
    if (n <= 1) return "pyq-content-right-img is-single";
    if (n === 2 || n === 4) return "pyq-content-right-img cols-2";
    return "pyq-content-right-img";
}

export function FeedCard({
    id, user, title, summary, content, images, hashtags, createdAt, updatedAt, top, draft, listed, likes, liked, comments
}: {
    id: string,
    user?: { id: number, username: string, avatar: string },
    title?: string,
    summary?: string,
    content?: string,
    images?: string[],
    hashtags: { id: number, name: string }[],
    createdAt: Date,
    updatedAt: Date,
    top?: number,
    draft?: number,
    listed?: number,
    likes?: number,
    liked?: boolean,
    comments?: FlatComment[],
}) {
    const { t } = useTranslation();
    const { LoginModal, setIsOpened } = useLoginModal();
    const profile = useContext(ProfileContext);
    // 列表已返回 likes/liked，直接用初始值，避免逐卡片请求
    const like = useLike(id, { count: likes || 0, liked: liked || false, fetch: false });
    // 卡片 hover/聚焦/触摸即预取文章详情 chunk 与数据，点击进入近乎秒开（幂等节流）
    const pf = usePrefetch(() => { prefetchPage('feed'); prefetchMarkdown(); prefetchFeedData(id) });
    const [lightbox, setLightbox] = useState<string | null>(null);
    const [commentOpen, setCommentOpen] = useState(false);
    const [cmtList, setCmtList] = useState(comments);
    const cardRef = useRef<HTMLDivElement>(null);

    // 收敛首页评论 N+1：不再挂载即拉取，改为卡片进入视口（含 200px 预加载边距）才拉一次，
    // 首屏仅当前/临近可见卡片请求评论，未滚到的卡片不发起，避免一屏 N 个并发请求造成 jank。
    // 列表已带评论数据时直接复用，不再请求。
    useEffect(() => {
        if (!id) return;
        if (comments && comments.length > 0) return;
        const el = cardRef.current;
        if (!el) return;
        let fetched = false;
        const load = () => {
            if (fetched) return;
            fetched = true;
            client.feed.comment({ feed: id }).get({ headers: headersWithAuth() })
                .then(({ data, error }) => {
                    if (!error && data && Array.isArray(data)) {
                        setCmtList(data as FlatComment[]);
                    }
                });
        };
        const io = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) {
                load();
                io.disconnect();
            }
        }, { rootMargin: "200px" });
        io.observe(el);
        return () => io.disconnect();
    }, [id, comments]);

    const author = user?.username || "匿名";
    const avatar = user?.avatar || "";
    const text = stripMdImages(summary || content || "");
    const full = (content || "").trim();
    const hasMore = full.length > (summary?.length || 0) + 1;
    const imgs = (images || []).slice(0, 9);
    const showComments = (cmtList && cmtList.length > 0) || like.count > 0;

    const onLike = () => {
        like.toggle();
    };

    return (
        <>
            <div className="pyq-content" {...pf} ref={cardRef}>
                <div className="pyq-content-left">
                    <Link href="/" aria-label="主页" title="主页">
                        {avatar
                            ? <img src={avatar} alt={author} referrerPolicy="no-referrer" />
                            : <div style={{ width: 38, height: 38, borderRadius: 6, background: "var(--imgbgy)" }} />}
                    </Link>
                </div>
                <div className="pyq-content-right">
                    <div className="pyq-content-right-head">
                        <div className="pyq-content-right-head-title">
                            <Link href={`/feed/${id}`} className="pyq-content-title-link">{title ? `${author} - ${title}` : author}</Link>
                        </div>
                        {(top === 1 || draft === 1 || listed === 0) &&
                            <div className="pyq-content-right-head-ad">
                                {top === 1 && <span className="pyq-content-right-head-title-ad" style={{ background: "var(--themetm)", color: "var(--theme)" }}>置顶</span>}
                                {draft === 1 && <span className="pyq-content-right-head-title-ad" style={{ background: "var(--protextbg)", color: "var(--protext)" }}>草稿</span>}
                                {listed === 0 && <span className="pyq-content-right-head-title-ad" style={{ background: "var(--protextbg)", color: "var(--protext)" }}>未列出</span>}
                            </div>}
                    </div>

                    {text &&
                        <div className="pyq-content-qwdid">{text}</div>}

                    {hasMore &&
                        <Link href={`/feed/${id}`} className="pyq-content-quanwenan">阅读全文</Link>}

                    {imgs.length > 0 &&
                        <div className={gridClass(imgs.length)}>
                            {imgs.map((src, i) => (
                                <div className="pyq-content-right-img-pic" key={i} onClick={() => setLightbox(src)}>
                                    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
                                </div>
                            ))}
                        </div>}

                    {hashtags.length > 0 &&
                        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {hashtags.map(({ name }, index) => (
                                <HashTag key={index} name={name} />
                            ))}
                        </div>}

                    <div className="pyq-content-right-time">
                        <div className="pyq-content-right-time-left">
                            <span>{createdAt === updatedAt ? timeago(createdAt) : t('feed_card.published$time', { time: timeago(createdAt) })}</span>
                        </div>
                        <div className="pyq-content-right-time-right">
                            <div className="pyq-content-right-time-right-left">
                                <span className="pyq-content-right-time-right-left-z" onClick={onLike}>
                                    <i className={like.liked ? "ri-heart-3-fill" : "ri-heart-3-line"} style={like.liked ? { color: "#fa5151", transform: "scale(1.15)", transition: "transform .15s ease" } : { transform: "scale(1)", transition: "transform .15s ease" }} />
                                    {like.count > 0 ? like.count : ""}
                                </span>
                                <button className="pyq-content-right-time-right-left-y" onClick={() => { if (!profile) setIsOpened(true); else setCommentOpen(true); }}>
                                    <i className="ri-message-3-line" />
                                    {(cmtList && cmtList.length > 0) ? cmtList.length : ""}
                                </button>
                            </div>
                        </div>
                    </div>

                    {showComments &&
                        <div className="pyq-zanp">
                            {like.count > 0 &&
                                <div className="pyq-zanp-zan" style={{ display: "flex" }}>
                                    <div className="pyq-zanp-zan-left"><i className="ri-heart-3-fill" style={{ color: "#fa5151" }} /></div>
                                    <ul className="pyq-zanp-zan-right">
                                        <li><span className="pyq-like-text">{like.count} 人点赞</span></li>
                                    </ul>
                                </div>}
                            {cmtList && cmtList.length > 0 &&
                                <div className="pyq-zanp-pl">
                                    {buildCommentTree(cmtList).map((node) => (
                                        <CommentItem key={node.id} comment={node} feedId={id} readOnly />
                                    ))}
                                </div>}
                        </div>}
                </div>
            </div>

            {lightbox &&
                <div className="pyq-lightbox" onClick={() => setLightbox(null)}>
                    <img src={lightbox} alt="" referrerPolicy="no-referrer" />
                </div>}
            <CommentModal feedId={id} open={commentOpen} onClose={() => setCommentOpen(false)} onPosted={(list) => setCmtList(list)} />
            <LoginModal />
        </>
    );
}
