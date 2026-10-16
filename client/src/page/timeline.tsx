import { useEffect, useRef, useState } from "react"
import { Helmet } from 'react-helmet'
import { Link } from "wouter"
import { Waiting } from "../components/loading"
import { PyqCoverHeader } from "../components/pyq_cover"
import { client } from "../main"
import { headersWithAuth } from "../utils/auth"
import { siteName } from "../utils/constants"
import { useTranslation } from "react-i18next";


export function TimelinePage() {
    const [feeds, setFeeds] = useState<Partial<Record<number, { id: number; title: string | null; createdAt: Date; }[]>>>()
    const [length, setLength] = useState(0)
    const ref = useRef(false)
    const { t } = useTranslation()
    function fetchFeeds() {
        client.feed.timeline.get({
            headers: headersWithAuth()
        }).then(({ data }) => {
            if (data && typeof data !== 'string') {
                setLength(data.length)
                const groups = Object.groupBy(data, ({ createdAt }) => new Date(createdAt).getFullYear())
                setFeeds(groups)
            }
        })
    }
    useEffect(() => {
        if (ref.current) return
        fetchFeeds()
        ref.current = true
    }, [])
    return (
        <>
            <Helmet>
                <title>{`${t('timeline')} - ${process.env.NAME}`}</title>
                <meta property="og:site_name" content={siteName} />
                <meta property="og:title" content={t('timeline')} />
                <meta property="og:image" content={process.env.AVATAR} />
                <meta property="og:type" content="article" />
                <meta property="og:url" content={document.URL} />
            </Helmet>
            <Waiting for={feeds}>
                <main className="pyq-main ani-show">
                    <PyqCoverHeader />
                    <div className="pyq-page-title">
                        {t('timeline')}
                        <span style={{ color: "var(--texths)", fontWeight: 400, marginLeft: 6 }}>{t('article.total$count', { count: length })}</span>
                    </div>
                    <div className="pyq-timeline">
                        {feeds && Object.keys(feeds).sort((a, b) => parseInt(b) - parseInt(a)).map(year => (
                            <div key={year}>
                                <div className="pyq-tl-year">
                                    {t('year$year', { year: year })}
                                    <span style={{ fontSize: 13, color: "var(--texths)", marginLeft: 8, fontWeight: 400 }}>
                                        {t('article.total_short$count', { count: feeds[+year]?.length })}
                                    </span>
                                </div>
                                {feeds[+year]?.map(({ id, title, createdAt }) => (
                                    <FeedItem key={id} id={id.toString()} title={title || t('untitled')} createdAt={new Date(createdAt)} />
                                ))}
                            </div>
                        ))}
                    </div>
                    <div className="pyq-copyright">© {new Date().getFullYear()} {process.env.NAME}</div>
                </main>
            </Waiting>
        </>
    )
}

export function FeedItem({ id, title, createdAt }: { id: string, title: string, createdAt: Date }) {
    const d = new Date(createdAt)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    return (
        <div className="pyq-tl-item">
            <div className="pyq-tl-date"><b>{day}</b><span>{month}</span></div>
            <Link className="pyq-tl-card" href={`/feed/${id}`}>
                <span style={{ color: "var(--thetitle)", fontSize: 15 }}>{title}</span>
            </Link>
        </div>
    )
}
