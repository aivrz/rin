import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { timeago } from "../utils/timeago";
import { HashTag } from "./hashtag";
import { useMemo } from "react";

// 去除 Markdown 图片语法，避免与九宫格重复出图（仿 pyq 正文去图）
function stripMdImages(text: string): string {
    return text.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function gridClass(n: number): string {
    if (n <= 1) return "pyq-grid pyq-grid-1";
    if (n === 2 || n === 4) return "pyq-grid pyq-grid-2";
    return "pyq-grid";
}

export function FeedCard({
    id, user, summary, content, images, hashtags, createdAt, updatedAt, top, draft, listed
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
}) {
    const { t } = useTranslation();
    const [liked, setLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(0);
    const [lightbox, setLightbox] = useState<string | null>(null);

    const author = user?.username || "匿名";
    const avatar = user?.avatar || "";
    const text = stripMdImages(summary || content || "");
    const imgs = (images || []).slice(0, 9);

    return useMemo(() => (
        <>
            <div className="pyq-card">
                <div className="pyq-card-head">
                    {avatar
                        ? <img className="pyq-card-avatar" src={avatar} alt={author} referrerPolicy="no-referrer" />
                        : <div className="pyq-card-avatar" />}
                    <div className="pyq-card-meta">
                        <div className="pyq-card-author">{author}</div>
                        <div className="pyq-card-time">
                            {createdAt === updatedAt ? timeago(createdAt) : t('feed_card.published$time', { time: timeago(createdAt) })}
                        </div>
                    </div>
                </div>

                {text &&
                    <Link href={`/feed/${id}`} className="pyq-card-text block">
                        {text}
                    </Link>}

                {imgs.length > 0 &&
                    <div className={gridClass(imgs.length)}>
                        {imgs.map((src, i) => (
                            <div className="pyq-grid-item" key={i} onClick={() => setLightbox(src)}>
                                <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
                            </div>
                        ))}
                    </div>}

                {hashtags.length > 0 &&
                    <div className="mt-2 flex flex-row flex-wrap justify-start gap-x-2">
                        {hashtags.map(({ name }, index) => (
                            <HashTag key={index} name={name} />
                        ))}
                    </div>}

                <div className="pyq-card-actions">
                    <span className="pyq-act" onClick={() => { setLiked(v => !v); setLikeCount(c => c + (liked ? -1 : 1)); }}>
                        {liked ? "❤️" : "🤍"} {likeCount > 0 ? likeCount : ""}
                    </span>
                    <Link className="pyq-act" href={`/feed/${id}`}>💬 {t('comment.title')}</Link>
                    <span className="pyq-act">↗</span>
                </div>

                {(top === 1 || draft === 1 || listed === 0) &&
                    <div className="mt-1 flex flex-row gap-2 text-xs" style={{ color: "var(--texths)" }}>
                        {top === 1 && <span style={{ color: "var(--theme)" }}>置顶</span>}
                        {draft === 1 && <span>草稿</span>}
                        {listed === 0 && <span>未列出</span>}
                    </div>}
            </div>

            {lightbox &&
                <div className="pyq-lightbox" onClick={() => setLightbox(null)}>
                    <img src={lightbox} alt="" referrerPolicy="no-referrer" />
                </div>}
        </>
    ), [id, author, avatar, text, imgs, hashtags, createdAt, updatedAt, top, draft, listed, liked, likeCount, lightbox]);
}
