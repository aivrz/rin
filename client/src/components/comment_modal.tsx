import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";
import { ProfileContext } from "../state/profile";
import { useLoginModal } from "../hooks/useLoginModal";

type CommentItem = {
    id: number;
    content: string;
    createdAt: Date | string;
    user: { id: number; username: string; avatar: string; permission: number };
};

// 仿朋友圈评论弹窗：半透明遮罩 + 底部面板，展示已有评论并提供输入框
export function CommentModal({ feedId, open, onClose, onPosted }: { feedId: string; open: boolean; onClose: () => void; onPosted?: (list: CommentItem[]) => void }) {
    const { t } = useTranslation();
    const profile = useContext(ProfileContext);
    const { setIsOpened } = useLoginModal();
    const [comments, setComments] = useState<CommentItem[]>([]);
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const draftKey = 'rin_comment_draft_' + feedId;

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        client.feed.comment({ feed: feedId }).get({ headers: headersWithAuth() })
            .then(({ data, error }) => {
                if (!error && data && Array.isArray(data)) {
                    setComments(data as CommentItem[]);
                }
            })
            .finally(() => setLoading(false));
    }, [open, feedId]);

    // 重新打开弹窗时，恢复未登录前暂存的评论草稿
    useEffect(() => {
        if (!open) return;
        const saved = sessionStorage.getItem(draftKey);
        if (saved) setContent(saved);
    }, [open, draftKey]);

    async function submit() {
        const c = content.trim();
        if (!c) return;
        if (!profile) {
            // 未登录：先记下当前文章页，登录后跳回；草稿已由输入 onChange 暂存
            sessionStorage.setItem('rin_post_login_redirect', window.location.pathname + window.location.search);
            setIsOpened(true);
            return;
        }
        setSubmitting(true);
        const { error } = await client.feed.comment({ feed: feedId }).post({ content: c }, { headers: headersWithAuth() });
        setSubmitting(false);
        if (!error) {
            setContent("");
            sessionStorage.removeItem(draftKey);
            const { data } = await client.feed.comment({ feed: feedId }).get({ headers: headersWithAuth() });
            if (data && Array.isArray(data)) {
                const list = data as CommentItem[];
                setComments(list);
                onPosted?.(list);
            }
        }
    }

    if (!open) return null;
    return (
        <div className="pyq-comment-mask" onClick={onClose}>
            <div className="pyq-comment-panel" onClick={(e) => e.stopPropagation()}>
                <div className="pyq-comment-head">
                    <span>{t('comment.title') || '评论'}</span>
                    <button className="pyq-comment-close" onClick={onClose} aria-label="关闭"><i className="ri-close-line" /></button>
                </div>
                <div className="pyq-comment-list">
                    {loading ? <div className="pyq-comment-empty">加载中…</div> :
                        comments.length === 0 ? <div className="pyq-comment-empty">还没有评论，来抢沙发~</div> :
                            comments.map((c) => (
                                <div className="pyq-comment-item" key={c.id}>
                                    <div className="pyq-comment-avatar">
                                        {c.user.avatar
                                            ? <img src={c.user.avatar} alt={c.user.username} referrerPolicy="no-referrer" />
                                            : <div className="pyq-comment-avatar-default" />}
                                    </div>
                                    <div className="pyq-comment-body">
                                        <div className="pyq-comment-name">{c.user.username}</div>
                                        <div className="pyq-comment-text">{c.content}</div>
                                    </div>
                                </div>
                            ))}
                </div>
                <div className="pyq-comment-input">
                    <input
                        value={content}
                        onChange={(e) => { setContent(e.target.value); sessionStorage.setItem(draftKey, e.target.value); }}
                        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                        placeholder={profile ? "说点什么…" : "登录后参与评论"}
                    />
                    <button onClick={submit} disabled={submitting}>{profile ? (t('comment.send') || '发送') : '登录后评价'}</button>
                </div>
            </div>
        </div>
    );
}
