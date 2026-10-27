import Editor from '@monaco-editor/react';
import { EditorToolbar } from "../components/EditorToolbar";
import i18n from 'i18next';
import _ from 'lodash';
import { editor } from 'monaco-editor';
import { Calendar } from 'primereact/calendar';
import 'primereact/resources/primereact.css';
import 'primereact/resources/themes/lara-light-indigo/theme.css';
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import Loading from 'react-loading';
import { ShowAlertType, useAlert } from '../components/dialog';
import { Checkbox, Input } from "../components/input";
import { Markdown } from "../components/markdown";
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";
import { uploadImageToR2 } from "../utils/upload";
import { Cache, useCache } from '../utils/cache';
import { siteName } from "../utils/constants";
import { useColorMode } from "../utils/darkModeUtils";
import mermaid from 'mermaid';

async function publish({
  title,
  alias,
  listed,
  content,
  summary,
  tags,
  draft,
  createdAt,
  onCompleted,
  showAlert
}: {
  title: string;
  listed: boolean;
  content: string;
  summary: string;
  tags: string[];
  draft: boolean;
  alias?: string;
  createdAt?: Date;
  onCompleted?: () => void;
  showAlert: ShowAlertType;
}) {
  const t = i18n.t
  const { data, error } = await client.feed.index.post(
    {
      title,
      alias,
      content,
      summary,
      tags,
      listed,
      draft,
      createdAt,
    },
    {
      headers: headersWithAuth(),
    }
  );
  if (onCompleted) {
    onCompleted();
  }
  if (error) {
    showAlert(error.value as string);
  }
  if (data && typeof data !== "string") {
    showAlert(t("publish.success"), () => {
      Cache.with().clear();
      window.location.href = "/feed/" + data.insertedId;
    });
  }
}

async function update({
  id,
  title,
  alias,
  content,
  summary,
  tags,
  listed,
  draft,
  createdAt,
  onCompleted,
  showAlert
}: {
  id: number;
  listed: boolean;
  title?: string;
  alias?: string;
  content?: string;
  summary?: string;
  tags?: string[];
  draft?: boolean;
  createdAt?: Date;
  onCompleted?: () => void;
  showAlert: ShowAlertType;
}) {
  const t = i18n.t
  const { error } = await client.feed({ id }).post(
    {
      title,
      alias,
      content,
      summary,
      tags,
      listed,
      draft,
      createdAt,
    },
    {
      headers: headersWithAuth(),
    }
  );
  if (onCompleted) {
    onCompleted();
  }
  if (error) {
    showAlert(error.value as string);
  } else {
    showAlert(t("update.success"), () => {
      Cache.with(id).clear();
      window.location.href = "/feed/" + id;
    });
  }
}

function uploadImage(file: File, onSuccess: (url: string) => void, showAlert: ShowAlertType) {
  uploadImageToR2(file)
    .then((url) => onSuccess(url))
    .catch((e: any) => showAlert(e?.message || i18n.t("upload.failed")));
}



// 后台文章管理列表：复用 FeedService 的列表/置顶/删除接口
function ManageList() {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchAll = async () => {
    setLoading(true);
    const types = ['normal', 'draft', 'unlisted'];
    const results = await Promise.all(
      types.map((tp) =>
        client.feed.index.get({
          query: { page: 1, limit: 300, type: tp },
          headers: headersWithAuth(),
        })
      )
    );
    const merged: any[] = [];
    for (const { data } of results) {
      if (data && typeof data !== "string") merged.push(...(data.data || []));
    }
    const map = new Map<number, any>();
    for (const f of merged) map.set(f.id, f);
    setItems(
      [...map.values()].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    );
    setLoading(false);
  };
  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function toggleTop(f: any) {
    const next = f.top === 1 ? 0 : 1;
    const { error } = await client.feed
      .top({ id: f.id })
      .post({ top: next }, { headers: headersWithAuth() });
    if (!error) {
      f.top = next;
      setItems([...items]);
      Cache.with().clear();
    } else {
      showAlert("操作失败");
    }
  }
  async function del(f: any) {
    if (!window.confirm(`确定删除《${f.title}》？此操作不可恢复`)) return;
    const { error } = await client
      .feed({ id: f.id })
      .delete({ headers: headersWithAuth() });
    if (!error) {
      setItems(items.filter((x) => x.id !== f.id));
      Cache.with().clear();
    } else {
      showAlert("删除失败");
    }
  }
  return (
    <div className="bg-w rounded-2xl shadow-xl shadow-light p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-lg">{t("manage.title") || "文章管理"}</span>
        <button onClick={fetchAll} className="text-theme text-sm flex items-center gap-1">
          <i className="ri-refresh-line" /> 刷新
        </button>
      </div>
      {loading ? (
        <div className="text-neutral-500 text-sm py-4">加载中…</div>
      ) : (
        <div className="flex flex-col">
          {items.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 py-2 border-b border-neutral-100"
            >
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  f.draft === 1
                    ? "bg-amber-100 text-amber-700"
                    : f.listed === 0
                    ? "bg-neutral-200 text-neutral-600"
                    : "bg-green-100 text-green-700"
                }`}
              >
                {f.draft === 1 ? "草稿" : f.listed === 0 ? "未列出" : "已发布"}
              </span>
              <Link
                href={`/feed/${f.alias || f.id}`}
                className="flex-1 truncate text-theme"
              >
                {f.title}
              </Link>
              <button
                onClick={() => toggleTop(f)}
                title="置顶"
                className="text-neutral-500"
              >
                <i
                  className={f.top === 1 ? "ri-pushpin-fill" : "ri-pushpin-line"}
                />
              </button>
              <Link href={`/writing/${f.id}`} className="text-neutral-500">
                <i className="ri-edit-line" />
              </Link>
              <button onClick={() => del(f)} className="text-red-500">
                <i className="ri-delete-bin-line" />
              </button>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-neutral-500 text-sm py-4">暂无文章</div>
          )}
        </div>
      )}
    </div>
  );
}

// 写作页面
export function WritingPage({ id }: { id?: number }) {
  const { t } = useTranslation();
  const colorMode = useColorMode();
  const cache = Cache.with(id);
  const editorRef = useRef<editor.IStandaloneCodeEditor>();
  const [title, setTitle] = cache.useCache("title", "");
  const [summary, setSummary] = cache.useCache("summary", "");
  const [tags, setTags] = cache.useCache("tags", "");
  const [alias, setAlias] = cache.useCache("alias", "");
  const [draft, setDraft] = useState(false);
  const [listed, setListed] = useState(true);
  const [content, setContent] = cache.useCache("content", "");
  const [createdAt, setCreatedAt] = useState<Date | undefined>(new Date());
  const [preview, setPreview] = useCache<'edit' | 'preview' | 'comparison'>("preview", 'edit');
  const [uploading, setUploading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [imageLink, setImageLink] = useState("")
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function markSaved() {
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSavedAt(new Date()), 600)
  }
  const { showAlert, AlertUI } = useAlert()
  function publishButton() {
    if (publishing) return;
    const tagsplit =
      tags
        .split("#")
        .filter((tag) => tag !== "")
        .map((tag) => tag.trim()) || [];
    if (id !== undefined) {
      setPublishing(true)
      update({
        id,
        title,
        content,
        summary,
        alias,
        tags: tagsplit,
        draft,
        listed,
        createdAt,
        onCompleted: () => {
          setPublishing(false)
        },
        showAlert
      });
    } else {
      if (!title) {
        showAlert(t("title_empty"))
        return;
      }
      if (!content) {
        showAlert(t("content.empty"))
        return;
      }
      setPublishing(true)
      publish({
        title,
        content,
        summary,
        tags: tagsplit,
        draft,
        alias,
        listed,
        createdAt,
        onCompleted: () => {
          setPublishing(false)
        },
        showAlert
      });
    }
  }


  const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    // Access the clipboard data using event.clipboardData
    const clipboardData = event.clipboardData;
    // only if clipboard payload is file
    if (clipboardData.files.length === 1) {
      const editor = editorRef.current;
      if (!editor) return;
      editor.trigger(undefined, "undo", undefined);
      setUploading(true)
      const myfile = clipboardData.files[0] as File;
      uploadImage(myfile, (url) => {
        const selection = editor.getSelection();
        if (!selection) return;
        editor.executeEdits(undefined, [{
          range: selection,
          text: `![${myfile.name}](${url})\n`,
        }]);
        setUploading(false)
      }, showAlert);
    }
  };

  function insertImageLink(url: string) {
    const u = url.trim();
    if (!u) return;
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    if (!selection) return;
    editor.executeEdits(undefined, [{
      range: selection,
      text: `![image](${u})\n`,
    }]);
  }

  function UploadImageButton() {
    const { showAlert, AlertUI } = useAlert();
    const uploadRef = useRef<HTMLInputElement>(null);
    const t = i18n.t
    const upChange = (event: any) => {
      for (let i = 0; i < event.currentTarget.files.length; i++) {
        const file = event.currentTarget.files[i]; ///获得input的第一个图片
        if (file.size > 5 * 1024000) {
          showAlert(t("upload.failed$size", { size: 5 }))
          uploadRef.current!.value = "";
        } else {
          const editor = editorRef.current;
          if (!editor) return;
          const selection = editor.getSelection();
          if (!selection) return;
          setUploading(true)
          uploadImage(file, (url) => {
            setUploading(false)
            editor.executeEdits(undefined, [{
              range: selection,
              text: `![${file.name}](${url})\n`,
            }]);
          }, showAlert);
        }
      }
    };
    return (
      <button onClick={() => uploadRef.current?.click()}>
        <input
          ref={uploadRef}
          onChange={upChange}
          className="hidden"
          type="file"
          accept="image/gif,image/jpeg,image/jpg,image/png"
        />
        <i className="ri-image-add-line" />
        <AlertUI />
      </button>
    )
  }
  useEffect(() => {
    if (id) {
      client
        .feed({ id })
        .get({
          headers: headersWithAuth(),
        })
        .then(({ data }) => {
          if (data && typeof data !== "string") {
            if (title == "" && data.title) setTitle(data.title);
            if (tags == "" && data.hashtags)
              setTags(data.hashtags.map(({ name }: { name: string }) => `#${name}`).join(" "));
            if (alias == "" && data.alias) setAlias(data.alias);
            if (content == "") setContent(data.content);
            if (summary == "") setSummary(data.summary);
            setListed(data.listed === 1);
            setDraft(data.draft === 1);
            setCreatedAt(new Date(data.createdAt));
          }
        });
    }
  }, []);
  const debouncedUpdate = useCallback(
    _.debounce(() => {
      mermaid.initialize({
        startOnLoad: false,
        theme: "default",
      });
      mermaid.run({
        suppressErrors: true,
        nodes: document.querySelectorAll("pre.mermaid_default")
      }).then(()=>{
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
        });
        mermaid.run({
          suppressErrors: true,
          nodes: document.querySelectorAll("pre.mermaid_dark")
        });
      })
    }, 100),
    []
  );
  useEffect(() => {
    debouncedUpdate();
  }, [content, debouncedUpdate]);
  function MetaInput({ className }: { className?: string }) {
    return (
      <>
        <div className={className}>
          <Input
            id={id}
            value={title}
            setValue={setTitle}
            placeholder={t("title")}
          />
          <Input
            id={id}
            value={summary}
            setValue={setSummary}
            placeholder={t("summary")}
            className="mt-4"
          />
          <Input
            id={id}
            value={tags}
            setValue={setTags}
            placeholder={t("tags")}
            className="mt-4"
          />
          <Input
            id={id}
            value={alias}
            setValue={setAlias}
            placeholder={t("alias")}
            className="mt-4"
          />
          <div
            className="select-none flex flex-row justify-between items-center mt-6 mb-2 px-4"
            onClick={() => setDraft(!draft)}
          >
            <p>{t('visible.self_only')}</p>
            <Checkbox
              id="draft"
              value={draft}
              setValue={setDraft}
              placeholder={t('draft')}
            />
          </div>
          <div
            className="select-none flex flex-row justify-between items-center mt-6 mb-2 px-4"
            onClick={() => setListed(!listed)}
          >
            <p>{t('listed')}</p>
            <Checkbox
              id="listed"
              value={listed}
              setValue={setListed}
              placeholder={t('listed')}
            />
          </div>
          <div className="select-none flex flex-row justify-between items-center mt-4 mb-2 pl-4">
            <p className="break-keep mr-2">
              {t('created_at')}
            </p>
            <Calendar value={createdAt} onChange={(e) => setCreatedAt(e.value || undefined)} showTime touchUI hourFormat="24" />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Helmet>
        <title>{`${t('writing')} - ${process.env.NAME}`}</title>
        <meta property="og:site_name" content={siteName} />
        <meta property="og:title" content={t('writing')} />
        <meta property="og:image" content={process.env.AVATAR} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={document.URL} />
      </Helmet>
      <div className="grid grid-cols-1 md:grid-cols-3 t-primary mt-2">
        <div className="col-span-2 pb-8">
          <div className="bg-w rounded-2xl shadow-xl shadow-light overflow-hidden">
            {MetaInput({ className: "p-4 border-b border-neutral-200 dark:border-neutral-700" })}
            <EditorToolbar editorRef={editorRef} />
            <div className="flex flex-col mx-4 my-2 gap-2">
              <div className="flex flex-row space-x-2 items-center">
                <button className={`${preview === 'edit' ? "text-theme" : ""}`} onClick={() => setPreview('edit')}> {t("edit")} </button>
                <button className={`${preview === 'preview' ? "text-theme" : ""}`} onClick={() => setPreview('preview')}> {t("preview")} </button>
                <button className={`${preview === 'comparison' ? "text-theme" : ""}`} onClick={() => setPreview('comparison')}> {t("comparison")} </button>
                <div className="flex-grow" />
                {savedAt && <span className="text-xs text-neutral-400 hidden sm:inline">已保存草稿 · {savedAt.toLocaleTimeString()}</span>}
                {uploading &&
                  <div className="flex flex-row space-x-2 items-center">
                    <Loading type="spin" color="#FC466B" height={16} width={16} />
                    <span className="text-sm text-neutral-500">{t('uploading')}</span>
                  </div>
                }
              </div>
              <div className={`grid grid-cols-1 ${preview === 'comparison' ? "sm:grid-cols-2" : ""}`}>
                <div className={"flex flex-col " + (preview === 'preview' ? "hidden" : "")}>
                  <div className="flex flex-row justify-start mb-2 items-center gap-2">
                    <UploadImageButton />
                    <input
                      value={imageLink}
                      onChange={(e) => setImageLink(e.target.value)}
                      placeholder="粘贴图片链接"
                      className="flex-1 min-w-0 rounded-lg px-3 py-1.5 text-sm outline-none bg-secondary t-primary"
                    />
                    <button onClick={() => { insertImageLink(imageLink); setImageLink(""); }}
                      className="rounded-full px-3 py-1.5 text-xs text-white cursor-pointer"
                      style={{ background: 'linear-gradient(90deg,#FC466B,#3F5EFB)' }}>
                      插入
                    </button>
                  </div>
                  <div
                    className={"relative rounded-xl transition-colors " + (dragOver ? "ring-2 ring-[var(--theme)] bg-secondary/40" : "ring-1 ring-transparent")}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      const editor = editorRef.current;
                      if (!editor) return;
                      for (let i = 0; i < e.dataTransfer.files.length; i++) {
                        const selection = editor.getSelection();
                        if (!selection) return;
                        const file = e.dataTransfer.files[i];
                        setUploading(true)
                        uploadImage(file, (url) => {
                          setUploading(false)
                          editor.executeEdits(undefined, [{
                            range: selection,
                            text: `![${file.name}](${url})\n`,
                          }]);
                        }, showAlert);
                      }
                    }}
                    onPaste={handlePaste}
                  >
                    <Editor
                      onMount={(editor, _) => {
                        editorRef.current = editor
                      }}
                      height="600px"
                      defaultLanguage="markdown"
                      className=""
                      value={content}
                      onChange={(data, _) => {
                        cache.set("content", data ?? "");
                        setContent(data ?? "");
                        markSaved();
                      }}
                      theme={colorMode === "dark" ? "vs-dark" : "light"}
                      options={{
                        wordWrap: "on",
                        fontSize: 14,
                        fontFamily: "Fira Code",
                        lineNumbers: "off",
                        dragAndDrop: true,
                        pasteAs: { enabled: false }
                      }}
                    />
                    {dragOver &&
                      <div className="absolute inset-0 flex items-center justify-center text-theme bg-white/70 dark:bg-black/40 rounded-xl pointer-events-none">
                        <span className="flex items-center gap-2"><i className="ri-image-add-line" /> 松开以插入图片</span>
                      </div>}
                  </div>
                </div>
                <div
                  className={"px-4 h-[600px] overflow-y-scroll " + (preview !== 'edit' ? "" : "hidden")}
                >
                  <Markdown content={content ? content : "> No content now. Write on the left side."} />
                </div>
              </div>
            </div>
          </div>
          <div className="visible md:hidden flex flex-row justify-center mt-8">
            <button
              onClick={publishButton}
              className="basis-1/2 bg-theme text-white py-4 rounded-full shadow-xl shadow-light flex flex-row justify-center items-center space-x-2"
            >
              {publishing &&
                <Loading type="spin" height={16} width={16} />
              }
              <span>
                {t('publish.title')}
              </span>
            </button>
          </div>
        </div>
        <div className="hidden md:flex flex-col">
          <div className="flex flex-row justify-center mt-8 md:mt-0">
            <button
              onClick={publishButton}
              className="basis-1/2 bg-theme text-white py-4 rounded-full shadow-xl shadow-light flex flex-row justify-center items-center space-x-2"
            >
              {publishing &&
                <Loading type="spin" height={16} width={16} />
              }
              <span>
                {t('publish.title')}
              </span>
            </button>
          </div>
        </div>
      </div>
      <ManageList />
      <AlertUI />
    </>

  );
}

