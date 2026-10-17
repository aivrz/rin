import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactModal from "react-modal";
import Popup from "reactjs-popup";
import { Link, useLocation } from "wouter";
import { useAlert, useConfirm } from "../components/dialog";
import { HashTag } from "../components/hashtag";
import { Waiting } from "../components/loading";
import { Markdown } from "../components/markdown";
import { FeedCard } from "../components/feed_card";
import { PyqCoverHeader } from "../components/pyq_cover";
import { PyqFloat } from "../components/pyq_float";
import { PyqMusicCard, PyqVideoEmbed, extractMedia } from "../components/pyq_media";
import { Seo } from "../components/seo";
import { client } from "../main";
import { ClientConfigContext } from "../state/config";
import { ProfileContext } from "../state/profile";
import { headersWithAuth } from "../utils/auth";
import { timeago } from "../utils/timeago";
import { buildCommentTree, CommentNode } from "../utils/commentTree";
import { Button } from "../components/button";
import { Tips } from "../components/tips";
import { useLoginModal } from "../hooks/useLoginModal";
import { useLike } from "../hooks/useLike";
import mermaid from "mermaid";

type Feed = {
  id: number;
  title: string | null;
  content: string;
  uid: number;
  createdAt: Date;
  updatedAt: Date;
  hashtags: {
    id: number;
    name: string;
  }[];
  user: {
    avatar: string | null;
    id: number;
    username: string;
  };
  pv: number;
  uv: number;
  top: number;
  comments?: {
    id: number;
    content: string;
    createdAt: Date;
    parentId: number | null;
    user: { id: number; username: string; avatar: string | null };
  }[];
  commentCount?: number;
  likes?: number;
  liked?: boolean;
};

export function FeedPage({ id, clean }: { id: string, _TOC: () => JSX.Element, clean: (id: string) => void }) {
  const { t } = useTranslation();
  const profile = useContext(ProfileContext);
  const [feed, setFeed] = useState<Feed>();
  const [error, setError] = useState<string>();
  const [headImage, setHeadImage] = useState<string>();
  const ref = useRef("");
  const [_, setLocation] = useLocation();
  const { showAlert, AlertUI } = useAlert();
  const { showConfirm, ConfirmUI } = useConfirm();
  const [top, setTop] = useState<number>(0);
  const config = useContext(ClientConfigContext);
  const counterEnabled = config.get<boolean>('counter.enabled');
  const { LoginModal: FeedLoginModal, setIsOpened: setIsLogin } = useLoginModal();
  // 详情接口已返回 likes/liked，直接用初始值，无需额外请求
  const like = useLike(id, { count: feed?.likes ?? 0, liked: !!feed?.liked, fetch: false });
  const onLike = () => { if (!profile) { setIsLogin(true); return; } like.toggle(); };
  const media = useMemo(() => feed ? extractMedia(feed.content) : { media: [], content: "" }, [feed]);
  function deleteFeed() {
    showConfirm(
      t("article.delete.title"),
      t("article.delete.confirm"),
      () => {
        if (!feed) return;
        client
          .feed({ id: feed.id })
          .delete(null, {
            headers: headersWithAuth(),
          })
          .then(({ error }) => {
            if (error) {
              showAlert(error.value as string);
            } else {
              showAlert(t("delete.success"));
              setLocation("/");
            }
          });
      })
  }
  function topFeed() {
    const isUnTop = !(top > 0)
    const topNew = isUnTop ? 1 : 0;
    showConfirm(
      isUnTop ? t("article.top.title") : t("article.untop.title"),
      isUnTop ? t("article.top.confirm") : t("article.untop.confirm"),
      () => {
        if (!feed) return;
        client
          .feed.top({ id: feed.id })
          .post({
            top: topNew,
          }, {
            headers: headersWithAuth(),
          })
          .then(({ error }) => {
            if (error) {
              showAlert(error.value as string);
            } else {
              showAlert(isUnTop ? t("article.top.success") : t("article.untop.success"));
              setTop(topNew);
            }
          });
      })
  }
  useEffect(() => {
    if (ref.current == id) return;
    setFeed(undefined);
    setError(undefined);
    setHeadImage(undefined);
    client
      .feed({ id })
      .get({
        headers: headersWithAuth(),
      })
      .then(({ data, error }) => {
        if (error) {
          setError(error.value as string);
        } else if (data && typeof data !== "string") {
          setTimeout(() => {
            setFeed(data);
            setTop(data.top);
            const img_reg = /!\[.*?\]\((.*?)\)/;
            const img_match = img_reg.exec(data.content);
            if (img_match) {
              setHeadImage(img_match[1]);
            }
            clean(id);
          }, 0);
        }
      });
    ref.current = id;
  }, [id]);
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
    });
    mermaid.run({
      suppressErrors: true,
      nodes: document.querySelectorAll("pre.mermaid_default")
    }).then(() => {
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
      });
      mermaid.run({
        suppressErrors: true,
        nodes: document.querySelectorAll("pre.mermaid_dark")
      });
    })
  }, [feed]);

  return (
    <Waiting for={feed || error}>
      {feed && (
        <Seo
          title={feed.title ?? undefined}
          description={feed.content.length > 200 ? feed.content.substring(0, 200) : feed.content}
          image={headImage ?? process.env.AVATAR}
          type="article"
          jsonLd={{
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            "headline": feed.title ?? "",
            "datePublished": new Date(feed.createdAt).toISOString(),
            "dateModified": new Date(feed.updatedAt).toISOString(),
            "author": { "@type": "Person", "name": feed.user.username },
            "image": headImage ?? process.env.AVATAR,
            "keywords": feed.hashtags.map(({ name }) => name).join(", "),
            "description": feed.content.length > 200 ? feed.content.substring(0, 200) : feed.content
          }}
        />
      )}
      <main className="pyq-main ani-show">
        <PyqCoverHeader />
        {error && (
          <div className="pyq-card" style={{ textAlign: "center" }}>
            <h1 className="t-primary" style={{ fontSize: 20, fontWeight: 700 }}>{error}</h1>
            {error === "Not found" && id === "about" && (
              <Tips value={t("about.notfound")} />
            )}
            <Button title={t("index.back")} onClick={() => (window.location.href = "/")} />
          </div>
        )}
        {feed && !error && (
          <>
            <article className="pyq-post" aria-label={feed.title ?? "Unnamed"}>
              <div className="pyq-post-head">
                {profile?.permission && (
                  <div className="pyq-post-admin">
                    <button aria-label={top > 0 ? t("untop.title") : t("top.title")} onClick={topFeed}>
                      <i className="ri-skip-up-line" />
                    </button>
                    <Link aria-label={t("edit")} href={`/writing/${feed.id}`}>
                      <i className="ri-edit-2-line" />
                    </Link>
                    <button aria-label={t("delete.title")} onClick={deleteFeed}>
                      <i className="ri-delete-bin-7-line" style={{ color: "#fa5151" }} />
                    </button>
                  </div>
                )}
                <h1 className="pyq-post-title">{feed.title}</h1>
                <div className="pyq-post-meta">
                  <img src={feed.user.avatar || "/avatar.png"} alt="" referrerPolicy="no-referrer" />
                  <span>{feed.user.username}</span>
                  <span title={new Date(feed.createdAt).toLocaleString()}>
                    {timeago(feed.createdAt)}
                  </span>
                  {feed.createdAt !== feed.updatedAt && (
                    <span title={new Date(feed.updatedAt).toLocaleString()}>
                      ({t("feed_card.updated$time", { time: timeago(feed.updatedAt) })})
                    </span>
                  )}
                  {counterEnabled && (
                    <span>· {t("count.pv")} {feed.pv} | {t("count.uv")} {feed.uv}</span>
                  )}
                </div>
              </div>
              {media.media.map((m, i) => (
                m.type === "music"
                  ? <PyqMusicCard key={i} url={m.url} title={feed.title || undefined} />
                  : <PyqVideoEmbed key={i} url={m.url} />
              ))}
              <Markdown content={media.content} />
              {feed.hashtags.length > 0 && (
                <div className="flex flex-row flex-wrap gap-2" style={{ marginTop: 14 }}>
                  {feed.hashtags.map(({ name }, index) => (
                    <HashTag key={index} name={name} />
                  ))}
                </div>
              )}
              <div className="pyq-post-likebar">
                <button className={like.liked ? "pyq-post-like on" : "pyq-post-like"} onClick={onLike}>
                  <i className={like.liked ? "ri-heart-3-fill" : "ri-heart-3-line"} style={like.liked ? { color: "#fa5151" } : undefined} />
                  <span>{like.liked ? "已赞" : "赞"}</span>
                  {like.count > 0 && <span className="pyq-post-like-count">{like.count}</span>}
                </button>
              </div>
            </article>
            {feed && <Comments id={`${feed.id}`} initial={feed.comments || []} />}
            <RelatedArticles id={feed.id} hashtags={feed.hashtags} />
            <div className="h-16" />
          </>
        )}
        <div className="pyq-copyright">© {new Date().getFullYear()} {process.env.NAME}</div>
      </main>
      <AlertUI />
      <ConfirmUI />
      <PyqFloat />
      <FeedLoginModal />
    </Waiting>
  );
}

export function TOCHeader({ TOC }: { TOC: () => JSX.Element }) {
  const [isOpened, setIsOpened] = useState(false);
  return (
    <div className="lg:hidden">
      <button
        onClick={() => setIsOpened(true)}
        className="w-10 h-10 rounded-full flex flex-row items-center justify-center"
      >
        <i className="ri-menu-2-fill t-primary ri-lg"></i>
      </button>
      <ReactModal
        isOpen={isOpened}
        style={{
          content: {
            top: "50%",
            left: "50%",
            right: "auto",
            bottom: "auto",
            marginRight: "-50%",
            transform: "translate(-50%, -50%)",
            padding: "0",
            border: "none",
            borderRadius: "16px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            background: "none",
          },
          overlay: {
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 1000,
          },
        }}
        onRequestClose={() => setIsOpened(false)}
      >
        <div className="w-[80vw] sm:w-[60vw] lg:w-[40vw] overflow-clip relative t-primary">
          <TOC />
        </div>
      </ReactModal>
    </div>
  );
}

function CommentInput({
  id,
  onRefresh,
}: {
  id: string;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const draftKey = "rin_comment_draft_" + id;
  const [content, setContent] = useState(() => sessionStorage.getItem(draftKey) || "");
  const [error, setError] = useState("");
  const { showAlert, AlertUI } = useAlert();
  const profile = useContext(ProfileContext);
  const { LoginModal, setIsOpened } = useLoginModal()
  function errorHumanize(error: string) {
    if (error === "Unauthorized") return t("login.required");
    else if (error === "Content is required") return t("comment.empty");
    return error;
  }
  function submit() {
    if (!profile) {
      sessionStorage.setItem("rin_post_login_redirect", window.location.pathname + window.location.search);
      setIsOpened(true)
      return;
    }
    client.feed
      .comment({ feed: id })
      .post(
        { content },
        {
          headers: headersWithAuth(),
        }
      )
      .then(({ error }) => {
        if (error) {
          setError(errorHumanize(error.value as string));
        } else {
          setContent("");
          sessionStorage.removeItem(draftKey);
          setError("");
          showAlert(t("comment.success"), () => {
            onRefresh();
          });
        }
      });
  }
  return (
    <div className="pyq-comment-input">
      <label htmlFor="comment">{t("comment.title")}</label>
      {profile ? (<>
        <textarea
          id="comment"
          placeholder={t("comment.placeholder.title")}
          value={content}
          onChange={(e) => { setContent(e.target.value); sessionStorage.setItem(draftKey, e.target.value); }}
        />
        <button className="pyq-btn-theme" onClick={submit}>
          {t("comment.submit")}
        </button>
      </>) : (
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <button className="pyq-btn-theme" onClick={() => { sessionStorage.setItem("rin_post_login_redirect", window.location.pathname + window.location.search); setIsOpened(true); }}>
            登录后评价
          </button>
        </div>
      )}
      {error && <p style={{ color: "#fa5151", fontSize: 13, marginTop: 8 }}>{error}</p>}
      <AlertUI />
      <LoginModal />
    </div>
  );
}

type Comment = {
  id: number;
  content: string;
  createdAt: Date;
  updatedAt?: Date;
  parentId: number | null;
  user: {
    id: number;
    username: string;
    avatar: string | null;
    permission?: number | null;
  };
};

function Comments({ id, initial }: { id: string, initial: Comment[] }) {
  const config = useContext(ClientConfigContext);
  const [comments, setComments] = useState<Comment[]>(initial || []);
  const [error, setError] = useState<string>();
  const ref = useRef("");
  const { t } = useTranslation();

  function loadComments() {
    client.feed
      .comment({ feed: id })
      .get({
        headers: headersWithAuth(),
      })
      .then(({ data, error }) => {
        if (error) {
          setError(error.value as string);
        } else if (data && Array.isArray(data)) {
          setComments(data as Comment[]);
        }
      });
  }
  useEffect(() => {
    if (ref.current == id) return;
    ref.current = id;
    // 始终通过评论接口拉取（含 parentId），保证嵌套层级正确
    loadComments();
  }, [id]);
  const tree = useMemo(() => buildCommentTree(comments), [comments]);
  return (
    <div className="pyq-comments">
      {config.get<boolean>('comment.enabled') &&
        <>
          <CommentInput id={id} onRefresh={loadComments} />
          {error && (
            <div className="pyq-card" style={{ textAlign: "center" }}>
              <h1 className="t-primary" style={{ fontSize: 18, fontWeight: 700 }}>{error}</h1>
              <button className="pyq-btn-theme" onClick={loadComments}>{t("reload")}</button>
            </div>
          )}
          {tree.length > 0 && (
            <div>
              <div className="pyq-page-title">评论 {comments.length}</div>
              {tree.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  feedId={id}
                  onRefresh={loadComments}
                  depth={0}
                />
              ))}
            </div>
          )}
        </>
      }
    </div>
  );
}

function CommentItem({
  comment,
  feedId,
  onRefresh,
  depth,
}: {
  comment: CommentNode;
  feedId: string;
  onRefresh: () => void;
  depth: number;
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
          .delete(null, {
            headers: headersWithAuth(),
          })
          .then(({ error }) => {
            if (error) {
              showAlert(error.value as string);
            } else {
              showAlert(t("delete.success"), () => {
                onRefresh();
              });
            }
          });
      })
  }
  function submitReply() {
    const text = replyContent.trim();
    if (!text) return;
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
          onRefresh();
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
          <button
            className="pyq-comment-reply-btn"
            style={{ fontSize: 12, color: "var(--texths)", marginTop: 4, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            onClick={() => setReplyOpen(!replyOpen)}
          >
            {t('comment.reply') || '回复'}
          </button>
        </div>
        {(profile?.permission || profile?.id == comment.user.id) && (
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
      {replyOpen && (
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

function RelatedArticles({ id }: { id: number, hashtags: { id: number, name: string }[] }) {
  const [list, setList] = useState<any[]>([]);
  useEffect(() => {
    client.feed.index.get({
      query: { page: 1, limit: 8, type: 'normal' },
      headers: headersWithAuth()
    }).then(({ data }) => {
      if (data && typeof data !== 'string') {
        setList((data.data || []).filter((f: any) => f.id !== id).slice(0, 4));
      }
    });
  }, [id]);
  if (!list.length) return null;
  return (
    <div>
      <div className="pyq-page-title">相关文章</div>
      {list.map(({ id, ...feed }: any) => (
        <FeedCard key={id} id={id} {...feed} />
      ))}
    </div>
  );
}
