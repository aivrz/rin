import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import Popup from "reactjs-popup";
import { client } from "../main";
import { ProfileContext } from "../state/profile";
import { useAlert, useConfirm } from "./dialog";
import { headersWithAuth } from "../utils/auth";
import { timeago } from "../utils/timeago";
import { CommentNode } from "../utils/commentTree";

// 统一的递归嵌套评论项：文章页评论区、评论弹窗、首页/列表卡片预览三处共用。
// readOnly 为真时仅展示（头像/昵称/时间/内容/嵌套子评论），隐藏回复与删除，供卡片预览使用。
export function CommentItem({
    comment,
    feedId,
    onRefresh,
    depth = 0,
    readOnly = false,
}: {
    comment: CommentNode;
    feedId?: string;
    onRefresh?: () => void;
    depth?: number;
    readOnly?: boolean;
}) {
    const { showConfirm, ConfirmUI } = useConfirm();
    const { showAlert, AlertUI } = useAlert();
    const { t } = useTranslation();
    const profile = useContext(ProfileContext);
    const [replyOpen, setReplyOpen] = useState(false);
    const [replyContent, setReplyContent] = useState("");
    const [submitting, setSubmitting] = useState(false);

    function deleteComment() {
        showConfirm(
            t("delete.comment.title"),
            t("delete.comment.confirm"),
            async () => {
                client
                    .comment({ id: comment.id })
                    .delete(null, { headers: headersWithAuth() })
                    .then(({ error }) => {
                        if (error) {
                            showAlert(error.value as string);
                        } else {
                            showAlert(t("delete.success"), () => {
                                onRefresh?.();
                            });
                        }
                    });
            }
        );
    }

    function submitReply() {
        const text = replyContent.trim();
        if (!text || !feedId) return;
        setSubmitting(true);
        client.feed
            .comment({ feed: feedId })
            .post(
                { content: text, parentId: comment.id },
                { headers: headersWithAuth() }
            )
            .then(({ error }) => {
                setSubmitting(false);
                if (error) {
                    showAlert(error.value as string);
                } else {
                    setReplyContent("");
                    setReplyOpen(false);
                    onRefresh?.();
                }
            });
    }

    return (
        <div>
            <div className="pyq-comment-item">
                <img src={comment.user.avatar || ""} alt="" referrerPolicy="no-referrer" />
                <div className="pyq-comment-body">
                    <div>
                        <span className="pyq-comment-name">{comment.user.username}</span>
                        <span className="pyq-comment-time" title={new Date(comment.createdAt).toLocaleString()}>
                            {timeago(comment.createdAt)}
                        </span>
                    </div>
                    <p className="pyq-comment-content">{comment.content}</p>
                    {!readOnly && (
                        <button
                            className="pyq-comment-reply-btn"
                            style={{ fontSize: 12, color: "var(--texths)", marginTop: 4, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                            onClick={() => setReplyOpen(!replyOpen)}
                        >
                            {t('comment.reply') || '回复'}
                        </button>
                    )}
                </div>
                {!readOnly && (profile?.permission || profile?.id == comment.user.id) && (
                    <Popup
                        arrow={false}
                        trigger={
                            <button className="px-2 py bg-secondary rounded-full" style={{ flex: "0 0 auto" }}>
                                <i className="ri-more-fill t-secondary"></i>
                            </button>
                        }
                        position="left center"
                    >
                        <div className="flex flex-row self-end mr-2">
                            <button
                                onClick={deleteComment}
                                aria-label={t("delete.comment.title")}
                                className="px-2 py bg-secondary rounded-full"
                            >
                                <i className="ri-delete-bin-2-line t-secondary"></i>
                            </button>
                        </div>
                    </Popup>
                )}
                <ConfirmUI />
                <AlertUI />
            </div>
            {!readOnly && replyOpen && (
                <div className="pyq-comment-input" style={{ marginTop: 6 }}>
                    <textarea
                        placeholder={`回复 @${comment.user.username}`}
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                    />
                    <button className="pyq-btn-theme" disabled={submitting} onClick={submitReply}>
                        {t('comment.send') || '发送'}
                    </button>
                </div>
            )}
            {depth < 6 && comment.replies.length > 0 && (
                <div style={{ marginLeft: 16, paddingLeft: 8, borderLeft: '1px solid var(--fgxys)' }}>
                    {comment.replies.map((child) => (
                        <CommentItem
                            key={child.id}
                            comment={child}
                            feedId={feedId}
                            onRefresh={onRefresh}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
