import { useEffect, useRef, useState } from "react"
import { Helmet } from 'react-helmet'
import { useTranslation } from "react-i18next"
import { FeedCard } from "../components/feed_card"
import { PyqCoverHeader } from "../components/pyq_cover"
import { Waiting } from "../components/loading"
import { client } from "../main"
import { headersWithAuth } from "../utils/auth"
import { siteName } from "../utils/constants"

type FeedsData = {
    name: string;
    id: number;
    createdAt: Date;
    updatedAt: Date;
    feeds: {
        hashtags: {
            name: string;
            id: number;
        }[];
        id: number;
        title: string | null;
        summary: string;
        content: string;
        createdAt: Date;
        updatedAt: Date;
        user: {
            id: number;
            username: string;
            avatar: string | null;
        };
    }[] | undefined;
}

export function HashtagPage({ name }: { name: string }) {
    const { t } = useTranslation()
    const [status, setStatus] = useState<'loading' | 'idle'>('idle')
    const [hashtag, setHashtag] = useState<FeedsData>()
    const ref = useRef("")
    function fetchFeeds() {
        const nameDecoded = decodeURI(name)
        client.tag({ name: nameDecoded }).get({
            headers: headersWithAuth()
        }).then(({ data }) => {
            if (data && typeof data !== 'string') {
                setHashtag(data)
                setStatus('idle')
            }
        })
    }
    useEffect(() => {
        if (ref.current === name) return
        setStatus('loading')
        fetchFeeds()
        ref.current = name
    }, [name])
    return (
        <>
            <Helmet>
                <title>{`${hashtag?.name} - ${process.env.NAME}`}</title>
                <meta property="og:site_name" content={siteName} />
                <meta property="og:title" content={hashtag?.name} />
                <meta property="og:image" content={process.env.AVATAR} />
                <meta property="og:type" content="article" />
                <meta property="og:url" content={document.URL} />
            </Helmet>
            <Waiting for={hashtag || status === 'idle'}>
                <main className="pyq-main">
                    <PyqCoverHeader />
                    <div className="pyq-nrbk">
                        <div className="pyq-page-title">
                            #{hashtag?.name}
                            <span style={{ color: "var(--texths)", fontWeight: 400, marginLeft: 6, fontSize: 14 }}>
                                {t('article.total$count', { count: hashtag?.feeds?.length })}
                            </span>
                        </div>
                        <Waiting for={status === 'idle'}>
                            {hashtag?.feeds && hashtag.feeds.length > 0
                                ? <div className="flex flex-col">
                                    {hashtag.feeds.map(({ id, ...feed }: any) => (
                                        <FeedCard key={id} id={id} {...feed} />
                                    ))}
                                </div>
                                : <div className="pyq-page-tip">{t('feed.empty')}</div>}
                        </Waiting>
                    </div>
                </main>
            </Waiting>
        </>
    )
}
