import { useEffect, useState } from "react";
import { FeedCard } from "../components/feed_card";
import { PyqCoverHeader } from "../components/pyq_cover";
import { Waiting } from "../components/loading";
import { Seo } from "../components/seo";
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";
import { useTranslation } from "react-i18next";

// 仿 pyq 置顶汇总页：列出全部置顶动态。
export function PinnedPage() {
    const { t } = useTranslation();
    const [data, setData] = useState<any[]>([]);
    const [status, setStatus] = useState<'loading' | 'idle'>('loading');
    useEffect(() => {
        client.feed.index.get({
            query: { page: 1, limit: 100, type: 'normal' },
            headers: headersWithAuth()
        }).then(({ data: res }) => {
            if (res && typeof res !== 'string') {
                setData((res.data || []).filter((f: any) => f.top === 1));
            }
            setStatus('idle');
        });
    }, []);
    return (
        <main className="pyq-main">
            <Seo title={t('pinned')} description="本站置顶精选动态汇总" />
            <PyqCoverHeader />
            <div className="pyq-nrbk">
                <div className="pyq-page-title">{t('pinned')}</div>
                <Waiting for={status === 'idle'}>
                    {data.length === 0
                        ? <div className="pyq-card" style={{ color: "var(--texths)" }}>暂无置顶动态</div>
                        : data.map((feed) => (
                            <FeedCard key={feed.id} id={feed.id} {...feed} />
                        ))}
                </Waiting>
            </div>
        </main>
    );
}
