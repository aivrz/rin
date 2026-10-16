import { useEffect, useRef, useState } from "react"
import { Helmet } from 'react-helmet'
import { useTranslation } from "react-i18next"
import { useSearch } from "wouter"
import { FeedCard } from "../components/feed_card"
import { PyqCoverHeader } from "../components/pyq_cover"
import { Waiting } from "../components/loading"
import { client } from "../main"
import { headersWithAuth } from "../utils/auth"
import { siteName } from "../utils/constants"
import { tryInt } from "../utils/int"

export function SearchPage({ keyword }: { keyword: string }) {
    const { t } = useTranslation()
    const query = new URLSearchParams(useSearch());
    const limit = tryInt(10, query.get("limit"), process.env.PAGE_SIZE)
    const [items, setItems] = useState<any[]>([])
    const [size, setSize] = useState(0)
    const [hasNext, setHasNext] = useState(false)
    const [status, setStatus] = useState<'loading' | 'idle'>('idle')
    const [loadingMore, setLoadingMore] = useState(false)
    const pageRef = useRef(1)
    const hasNextRef = useRef(false)
    const loadingRef = useRef(false)
    const keywordRef = useRef(keyword)
    const limitRef = useRef(limit)
    const sentinelRef = useRef<HTMLDivElement>(null)
    const year = new Date().getFullYear()

    limitRef.current = limit
    keywordRef.current = keyword

    function fetchPage(p: number, replace: boolean) {
        if (loadingRef.current || !keywordRef.current) return
        loadingRef.current = true
        setLoadingMore(true)
        client.search({ keyword: keywordRef.current }).get({
            query: { page: p, limit: limitRef.current },
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
            setLoadingMore(false)
            loadingRef.current = false
        })
    }

    function ensureFilled() {
        const el = sentinelRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        if (hasNextRef.current && !loadingRef.current && rect.top <= window.innerHeight + 400) {
            fetchPage(pageRef.current + 1, false)
        }
    }

    // 关键词切换：重置并加载第一页
    useEffect(() => {
        if (!keyword) {
            setStatus('idle')
            setItems([])
            setSize(0)
            setHasNext(false)
            return
        }
        setStatus('loading')
        setItems([])
        pageRef.current = 1
        hasNextRef.current = true
        fetchPage(1, true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [keyword])

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

    const title = t('article.search.title$keyword', { keyword })

    return (
        <>
            <Helmet>
                <title>{`${title} - ${process.env.NAME}`}</title>
                <meta property="og:site_name" content={siteName} />
                <meta property="og:title" content={title} />
                <meta property="og:image" content={process.env.AVATAR} />
                <meta property="og:type" content="article" />
                <meta property="og:url" content={document.URL} />
            </Helmet>
            <Waiting for={items.length > 0 || status === 'idle'}>
                <main className="pyq-main">
                    <PyqCoverHeader />
                    <div className="pyq-page-title">
                        {t('article.search.title')}
                        <span style={{ color: "var(--texths)", fontWeight: 400, marginLeft: 6 }}>{size}</span>
                    </div>
                    <Waiting for={status === 'idle'}>
                        {items.length > 0
                            ? <div>
                                {items.map(({ id, ...feed }: any) => (
                                    <FeedCard key={id} id={id} {...feed} />
                                ))}
                            </div>
                            : <div className="pyq-page-tip">{t('feed.empty')}</div>}
                        <div className="pyq-infinite-footer">
                            {loadingMore && <div className="pyq-infinite-tip"><span className="pyq-spinner" /> {t('feed.loading_more')}</div>}
                            {!hasNext && items.length > 0 && <div className="pyq-infinite-tip pyq-infinite-nomore">{t('feed.no_more')}</div>}
                            {hasNext && !loadingMore && items.length > 0 &&
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
