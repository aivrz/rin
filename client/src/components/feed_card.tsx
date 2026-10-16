import { useContext, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Heart, MessageCircle } from "lucide-react";
import { timeago } from "../utils/timeago";
import { HashTag } from "./hashtag";
import { useLike } from "../hooks/useLike";
import { ProfileContext } from "../state/profile";
import { useLoginModal } from "../hooks/useLoginModal";

function stripMdImages(text: string): string {
    return text.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function gridClass(n: number): string {
    if (n <= 1) return "pyq-content-right-img is-single";
    if (n === 2 || n === 4) return "pyq-content-right-img cols-2";
    return "pyq-content-right-img";
}

export function FeedCard({
    id, user, summary, content, images, hashtags, createdAt, updatedAt, top, draft, listed, likes, comments
}: {
    id: string,
    user?: { id: number, username: string, avatar: string },
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
    comments?: { user: { username: string }, content: string }[],
}) {
    const { t } = useTranslation();
    const profile = useContext(ProfileContext);
    const { LoginModal, setIsOpened } = useLoginModal();
    // 列表已返回 likes/liked，直接用初始值，避免逐卡片请求
    const like = useLike(id, { count: likes || 0, liked: liked || false, fetch: false });
    const [lightbox, setLightbox] = useState<string | null>(null);

    const author = user?.username || "匿名";
    const avatar = user?.avatar || "";
    const text = stripMdImages(summary || content || "");
    const full = (content || "").trim();
    const hasMore = full.length > (summary?.length || 0) + 1;
    const imgs = (images || []).slice(0, 9);
    const showComments = (comments && comments.length > 0) || like.count > 0;

    const onLike = () => {
        if (!profile) { setIsOpened(true); return; }
        like.toggle();
    };

    return (
        <>
            <div className="pyq-content">
                <div className="pyq-content-left">
                    {avatar
                        ? <img src={avatar} alt={author} referrerPolicy="no-referrer" />
                        : <div style={{ width: 38, height: 38, borderRadius: 6, background: "var(--imgbgy)" }} />}
                </div>
                <div className="pyq-content-right">
                    <div className="pyq-content-right-head">
                        <div className="pyq-content-right-head-title">
                            <p>{author}</p>
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
                                    <Heart fill={like.liked ? "#fa5151" : "none"} style={like.liked ? { color: "#fa5151" } : undefined} />
                                    {like.count > 0 ? like.count : ""}
                                </span>
                                <Link href={`/feed/${id}`} className="pyq-content-right-time-right-left-y">
                                    <MessageCircle />
                                    {(comments && comments.length > 0) ? comments.length : ""}
                                </Link>
                            </div>
                        </div>
                    </div>

                    {showComments &&
                        <div className="pyq-zanp">
                            {like.count > 0 &&
                                <div className="pyq-zanp-zan" style={{ display: "flex" }}>
                                    <div className="pyq-zanp-zan-left"><Heart fill="#fa5151" style={{ color: "#fa5151" }} /></div>
                                    <ul className="pyq-zanp-zan-right">
                                        <li><span className="pyq-like-text">{like.count} 人点赞</span></li>
                                    </ul>
                                </div>}
                            {comments && comments.length > 0 &&
                                <ul className="pyq-zanp-pl">
                                    {comments.map((c, i) => (
                                        <li key={i}>
                                            <span className="pyq-zanp-pl-n-nc">{c.user.username}</span>
                                            <span className="pyq-zanp-pl-n-huifu">：</span>
                                            <span className="pyq-zanp-pl-n-nr">{c.content}</span>
                                        </li>
                                    ))}
                                </ul>}
                        </div>}
                </div>
            </div>

            {lightbox &&
                <div className="pyq-lightbox" onClick={() => setLightbox(null)}>
                    <img src={lightbox} alt="" referrerPolicy="no-referrer" />
                </div>}
            <LoginModal />
        </>
    );
}
