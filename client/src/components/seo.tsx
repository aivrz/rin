import { Helmet } from "react-helmet";
import { siteName } from "../utils/constants";

// 统一 SEO 元信息组件：title/description/OG/Twitter/canonical + 可选 JSON-LD
export function Seo({ title, description, image, url, type = "website", jsonLd }: {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    type?: string;
    jsonLd?: object;
}) {
    const fullTitle = title ? `${title} - ${siteName}` : siteName;
    const desc = description || process.env.DESCRIPTION || siteName;
    const canonical = url || (typeof document !== 'undefined' ? document.URL : '');
    return (
        <Helmet>
            <title>{fullTitle}</title>
            <meta name="description" content={desc} />
            <link rel="canonical" href={canonical} />
            <meta property="og:site_name" content={siteName} />
            <meta property="og:title" content={fullTitle} />
            <meta property="og:description" content={desc} />
            <meta property="og:type" content={type} />
            <meta property="og:url" content={canonical} />
            {image && <meta property="og:image" content={image} />}
            <meta name="twitter:card" content={image ? "summary_large_image" : "summary"} />
            <meta name="twitter:title" content={fullTitle} />
            <meta name="twitter:description" content={desc} />
            {image && <meta name="twitter:image" content={image} />}
            {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
        </Helmet>
    );
}
