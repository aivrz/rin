import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";
import { ProfileContext } from "../state/profile";
import { useLoginModal } from "../hooks/useLoginModal";
import { buildCommentTree, FlatComment } from "../utils/commentTree";
import { CommentItem } from "./comment_item";

// 仿朋友圈评论弹窗：半透明遮罩 + 底部面板，展示已有评论（含嵌套回复）并提供输入框
export function CommentModal({ feedId, open, onClose, onPosted }: { feedId: string; open: boolean; onClose: () => void; onPosted?: (list: FlatComment[]) => void }) {
    const { t } = useTranslation();
    const profile = useContext(ProfileContext);
    const { setIsOpened } = useLoginModal();
    const [comments, setComments] = useState<FlatComment[]>([]);
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const draftKey = 'rin_comment_draft_' + feedId;

    function fetchComments() {
        setLoading(true);
        client.feed.comment({ feed: feedId }).get({ headers: headersWithAuth() })
            .then(({ data, error }) => {
                if (!error && data && Array.isArray(data)) {
                    const list = data as FlatComment[];
                    setComments(list);
                    onPosted?.(list);
                }
            })
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        if (!open) return;
        fetchComments();
        const saved = sessionStorage.getItem(draftKey);
        if (saved) setContent(saved);
    }, [open, feedId]);

    async function submit() {
        const text = content.trim();
        if (!text) return;
        if (!profile) {
            sessionStorage.setItem('rin_post_login_redirect', window.location.pathname + window.location.search);
            sessionStorage.setItem(draftKey, content);
            setIsOpened(true);
            return;
        }
        setSubmitting(true);
        const { error } = await client.feed.comment({ feed: feedId }).post(
            { content: text },
            { headers: headersWithAuth() }
        );
        setSubmitting(false);
        if (!error) {
            setContent("");
            sessionStorage.removeItem(draftKey);
            fetchComments();
        }
    }

    if (!open) return null;
    const tree = buildCommentTree(comments);
    return createPortal(
        <div className="pyq-comment-mask" onClick={onClose}>
            <div className="pyq-comment-panel" onClick={(e) => e.stopPropagation()}>
                <div className="pyq-comment-head">
                    <span>{t('comment.title') || '评论'}</span>
                    <button className="pyq-comment-close" onClick={onClose} aria-label="关闭"><i className="ri-close-line" /></button>
                </div>
                <div className="pyq-comment-list">
                    {loading ? <div className="pyq-comment-empty">加载中…</div> :
                        tree.length === 0 ? <div className="pyq-comment-empty">还没有评论，来抢沙发~</div> :
                            tree.map((node) => <CommentItem key={node.id} comment={node} feedId={feedId} onRefresh={fetchComments} depth={0} />)}
                </div>
                <div className="pyq-comment-input">
                    <input
                        value={content}
                        onChange={(e) => { setContent(e.target.value); sessionStorage.setItem(draftKey, e.target.value); }}
                        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                        placeholder={profile ? "说点什么…" : "登录后参与评论"}
                    />
                    <button onClick={() => submit()} disabled={submitting}>{profile ? (t('comment.send') || '发送') : '登录后评价'}</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
