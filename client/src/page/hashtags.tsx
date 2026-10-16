import { useEffect, useRef, useState } from "react";
import { Helmet } from 'react-helmet';
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { PyqCoverHeader } from "../components/pyq_cover";
import { Waiting } from "../components/loading";
import { client } from "../main";
import { siteName } from "../utils/constants";

type Hashtag = {
    id: number;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    feeds: number;
}

export function HashtagsPage() {
    const { t } = useTranslation();
    const [hashtags, setHashtags] = useState<Hashtag[]>();
    const ref = useRef(false);
    useEffect(() => {
        if (ref.current) return;
        client.tag.index.get().then(({ data }) => {
            if (data && typeof data !== 'string') {
                setHashtags(data);
            }
        });
        ref.current = true;
    }, [])
    return (
        <>
            <Helmet>
                <title>{`${t('hashtags')} - ${process.env.NAME}`}</title>
                <meta property="og:site_name" content={siteName} />
                <meta property="og:title" content={t('hashtags')} />
                <meta property="og:image" content={process.env.AVATAR} />
                <meta property="og:type" content="article" />
                <meta property="og:url" content={document.URL} />
            </Helmet>
            <Waiting for={hashtags}>
                <main className="pyq-main">
                    <PyqCoverHeader />
                    <div className="pyq-nrbk">
                        <div className="pyq-page-title">{t('hashtags')}</div>
                        <div className="pyq-card">
                            {hashtags?.filter(({ feeds }) => feeds > 0).map((hashtag, index) => {
                                return (
                                    <Link key={index} href={`/hashtag/${hashtag.name}`}
                                        className="pyq-hashtag-row">
                                        <span className="pyq-hashtag-name">#{hashtag.name}</span>
                                        <span className="pyq-hashtag-count">
                                            {t("article.total_short$count", { count: hashtag.feeds })}
                                        </span>
                                    </Link>
                                )
                            })}
                        </div>
                    </div>
                </main>
            </Waiting>
        </>
    )
}
