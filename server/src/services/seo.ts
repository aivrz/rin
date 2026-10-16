import Elysia from "elysia";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import type { Env } from "../db/db";
import { feeds, hashtags } from "../db/schema";
import { getDB, getEnv } from "../utils/di";
import { PublicCache } from "../utils/cache";

function escapeXml(s: string): string {
    return s.replace(/[<>&'"]/g, (c) => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
    }[c] as string));
}

export function SEOService() {
    const env: Env = getEnv();
    const endpoint = env.S3_ENDPOINT;
    const accessHost = env.S3_ACCESS_HOST || endpoint;
    const folder = env.S3_CACHE_FOLDER || 'cache/';
    const db = getDB();
    const base = (env.FRONTEND_URL || '').replace(/\/$/, '');
    return new Elysia({ aot: false })
        .get('/seo/*', async ({ set, params, query }) => {
            if (!accessHost) {
                set.status = 500;
                return 'S3_ACCESS_HOST is not defined'
            }
            let url = params['*'];
            // query concat
            for (const key in query) {
                url += `&${key}=${query[key]}`;
            }
            if (url.endsWith('/') || url === '') {
                url += 'index.html';
            }
            const key = path.join(folder, url);
            try {
                const url = `${accessHost}/${key}`;
                console.log(`Fetching ${url}`);
                const response = await fetch(new Request(url))
                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                });
            } catch (e: any) {
                console.error(e);
                set.status = 500;
                return e.message;
            }
        })
        .get('/robots.txt', ({ set }) => {
            set.headers['Content-Type'] = 'text/plain; charset=utf-8';
            return `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`;
        })
        .get('/sitemap.xml', async ({ set }) => {
            set.headers['Content-Type'] = 'application/xml; charset=utf-8';
            const cache = PublicCache();
            const xml = await cache.getOrSet('sitemap', async () => {
                const [feedList, tagList] = await Promise.all([
                    db.query.feeds.findMany({
                        where: and(eq(feeds.draft, 0), eq(feeds.listed, 1)),
                        columns: { id: true, alias: true, updatedAt: true },
                        orderBy: [desc(feeds.updatedAt)],
                        limit: 1000,
                    }),
                    db.query.hashtags.findMany({
                        columns: { id: true, name: true },
                        limit: 500,
                    }),
                ]);
                const urls: string[] = [];
                urls.push(`<url><loc>${escapeXml(base + '/')}</loc></url>`);
                urls.push(`<url><loc>${escapeXml(base + '/timeline')}</loc></url>`);
                urls.push(`<url><loc>${escapeXml(base + '/hashtags')}</loc></url>`);
                urls.push(`<url><loc>${escapeXml(base + '/friends')}</loc></url>`);
                urls.push(`<url><loc>${escapeXml(base + '/nav')}</loc></url>`);
                for (const f of feedList) {
                    const slug = f.alias ? encodeURIComponent(f.alias) : String(f.id);
                    const loc = base + '/feed/' + slug;
                    const lastmod = f.updatedAt ? `<lastmod>${new Date(f.updatedAt).toISOString()}</lastmod>` : '';
                    urls.push(`<url><loc>${escapeXml(loc)}</loc>${lastmod}</url>`);
                }
                for (const t of tagList) {
                    urls.push(`<url><loc>${escapeXml(base + '/hashtag/' + encodeURIComponent(t.name))}</loc></url>`);
                }
                return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
            });
            return xml;
        })
}
