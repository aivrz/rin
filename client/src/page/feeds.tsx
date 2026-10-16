import { useContext, useEffect, useRef, useState } from "react"
import { Helmet } from 'react-helmet'
import { Link, useSearch } from "wouter"
import { FeedCard } from "../components/feed_card"
import { PyqCoverHeader } from "../components/pyq_cover"
import { PinnedBar } from "../components/pinned_bar"
import { Waiting } from "../components/loading"
import { client } from "../main"
import { ProfileContext } from "../state/profile"
import { headersWithAuth } from "../utils/auth"
import { siteName } from "../utils/constants"
import { tryInt } from "../utils/int"
import { useTranslation } from "react-i18next";

type FeedType = 'draft' | 'unlisted' | 'normal'

export function FeedsPage() {
    const { t } = useTranslation()
    const query = new URLSearchParams(useSearch());
    const profile = useContext(ProfileContext);
    const type = (query.get("type") as FeedType) || 'normal'
    const limit = tryInt(10, query.get("limit"), process.env.PAGE_SIZE)
    const [listState, setListState] = useState<FeedType>(type)
    const [items, setItems] = useState<any[]>([])
    const [size, setSize] = useState(0)
    const [hasNext, setHasNext] = useState(false)
    const [status, setStatus] = useState<'loading' | 'idle'>('idle')
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState(false)
    const pageRef = useRef(1)
    const hasNextRef = useRef(false)
    const loadingRef = useRef(false)
    const errorRef = useRef(false)
    const typeRef = useRef<FeedType>(type)
    const limitRef = useRef(limit)
    const sentinelRef = useRef<HTMLDivElement>(null)
    const year = new Date().getFullYear()

    typeRef.current = type
    limitRef.current = limit

    function fetchPage(p: number, replace: boolean) {
        if (loadingRef.current) return
        loadingRef.current = true
        setLoadingMore(true)
        client.feed.index.get({
            query: { page: p, limit: limitRef.current, type: typeRef.current },
            headers: headersWithAuth()
        }).then(({ data }) => {
            if (data && typeof data !== 'string') {
                const d = data as { size: number, data: any[], hasNext: boolean }
                setSize(d.size)
                setHasNext(d.hasNext)
                hasNextRef.current = d.hasNext
                setItems(prev => replace ? d.data : [...prev, ...d.data])
                pageRef.current = p
            }
            setStatus('idle')
            setLoadingMore(false)
            loadingRef.current = false
            // 内容不足一屏时自动续拉，直到填满视口或无更多
            ensureFilled()
        }).catch(() => {
            setError(true)
            errorRef.current = true
            setHasNext(false)
            hasNextRef.current = false
            setStatus('idle')
            setLoadingMore(false)
            loadingRef.current = false
        })
    }

    function ensureFilled() {
        const el = sentinelRef.current
        if (!el || errorRef.current) return
        const rect = el.getBoundingClientRect()
        if (hasNextRef.current && !loadingRef.current && rect.top <= window.innerHeight + 400) {
            fetchPage(pageRef.current + 1, false)
        }
    }

    // 类型切换：重置并加载第一页
    useEffect(() => {
        if (type !== listState) setListState(type)
        setStatus('loading')
        setItems([])
        setError(false)
        errorRef.current = false
        pageRef.current = 1
        hasNextRef.current = true
        fetchPage(1, true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [type])

    // 滚动到底部哨兵附近时加载更多
    useEffect(() => {
        const onScroll = () => ensureFilled()
        window.addEventListener('scroll', onScroll, { passive: true })
        window.addEventListener('resize', onScroll)
        return () => {
            window.removeEventListener('scroll', onScroll)
            window.removeEventListener('resize', onScroll)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <>
            <Helmet>
                <title>{`${t('article.title')} - ${process.env.NAME}`}</title>
                <meta property="og:site_name" content={siteName} />
                <meta property="og:title" content={t('article.title')} />
                <meta property="og:image" content={process.env.AVATAR} />
                <meta property="og:type" content="article" />
                <meta property="og:url" content={document.URL} />
            </Helmet>
            <Waiting for={items.length > 0 || status === 'idle'}>
                <main className="pyq-main">
                    <PyqCoverHeader />
                    <PinnedBar />
                    {profile?.permission &&
                        <div className="pyq-page-title flex flex-row items-center justify-between">
                            <span>
                                {listState === 'draft' ? t('draft_bin') : listState === 'normal' ? t('article.title') : t('unlisted')}
                                <span style={{ color: "var(--texths)", fontWeight: 400, marginLeft: 6 }}>{size}</span>
                            </span>
                            <span className="flex flex-row gap-4" style={{ color: "var(--texths)", fontSize: 13 }}>
                                <Link href={listState === 'draft' ? '/?type=normal' : '/?type=draft'}
                                    style={{ color: listState === 'draft' ? "var(--theme)" : "var(--texths)" }}>{t('draft_bin')}</Link>
                                <Link href={listState === 'unlisted' ? '/?type=normal' : '/?type=unlisted'}
                                    style={{ color: listState === 'unlisted' ? "var(--theme)" : "var(--texths)" }}>{t('unlisted')}</Link>
                            </span>
                        </div>}
                    <Waiting for={status === 'idle'}>
                        <div>
                            {items.map(({ id, ...feed }: any) => (
                                <FeedCard key={id} id={id} {...feed} />
                            ))}
                        </div>
                        <div className="pyq-infinite-footer">
                            {loadingMore && <div className="pyq-infinite-tip"><span className="pyq-spinner" /> {t('feed.loading_more')}</div>}
                            {error && <div className="pyq-infinite-tip" style={{ color: "#fa5151" }}>加载失败，请稍后重试</div>}
                            {!error && !hasNext && items.length > 0 && <div className="pyq-infinite-tip pyq-infinite-nomore">{t('feed.no_more')}</div>}
                            {!error && hasNext && !loadingMore && items.length > 0 &&
                                <button className="pyq-nav-item pyq-infinite-btn" onClick={() => fetchPage(pageRef.current + 1, false)}>{t('feed.load_more')}</button>}
                            <div ref={sentinelRef} />
                        </div>
                    </Waiting>
                    <div className="pyq-copyright">
                        © {year} {process.env.NAME}
                    </div>
                </main>
            </Waiting>
        </>
    )
}
