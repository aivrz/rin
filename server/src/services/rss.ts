import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import Elysia from "elysia";
import { Feed } from "feed";
import path from 'path';
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import type { Env } from "../db/db";
import * as schema from "../db/schema";
import { feeds, users } from "../db/schema";
import { getEnv } from "../utils/di";
import { extractImage } from "../utils/image";
import { accessHost as cdnAccessHost, cdnHost } from "../utils/cdn";

export function RSSService() {
    const env: Env = getEnv();
    const folder = env.S3_CACHE_FOLDER || 'cache/';
    return new Elysia({ aot: false })
        .get('/sub/:name', async ({ set, params: { name } }) => {
            const accessHost = await cdnAccessHost(env);
            const host = `${(accessHost.startsWith("http://") || accessHost.startsWith("https://") ? '' :'https://')}${accessHost}`;
            if (!host) {
                set.status = 500;
                return 'S3_ACCESS_HOST is not defined'
            }
            if (name === 'feed.xml') {
                name = 'rss.xml';
            }
            if (['rss.xml', 'atom.xml', 'rss.json'].includes(name)) {
                const key = path.join(folder, name);
                try {
                    const url = `${host}/${key}`;
                    console.log(`Fetching ${url}`);
                    const response = await fetch(new Request(url))
                    const contentType = name === 'rss.xml' ? 'application/rss+xml; charset=UTF-8' : name === 'atom.xml' ? 'application/atom+xml; charset=UTF-8' : 'application/feed+json; charset=UTF-8';
                    const text = await response.text();
                    const cdnVal = await cdnHost(env);
                    const from = env.S3_ACCESS_HOST;
                    const body = (cdnVal && from) ? text.split(from).join(cdnVal) : text;
                    return new Response(body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: {
                            'Content-Type': contentType,
                            'Cache-Control': response.headers.get('Cache-Control') || 'public, max-age=3600',
                        }
                    });
                } catch (e: any) {
                    console.error(e);
                    set.status = 500;
                    return e.message;
                }
            }
            set.status = 404;
            return 'Not Found';
        })
}

export async function rssCrontab(env: Env) {
    const frontendUrl = `${(env.FRONTEND_URL.startsWith("http://") || env.FRONTEND_URL.startsWith("https://") ? '' :'https://')}${env.FRONTEND_URL}`;
    const db = drizzle(env.DB, { schema: schema })
    let title = env.RSS_TITLE;
    const description = env.RSS_DESCRIPTION || "Feed from Rin";
    if (!title) {
        const user = await db.query.users.findFirst({ where: eq(users.id, 1) });
        if (!user) {
            return;
        }
        title = user.username;
    }
    const feed = new Feed({
        title: title,
        description: description,
        id: frontendUrl,
        link: frontendUrl,
        favicon: `${frontendUrl}/favicon.png`,
        copyright: "All rights reserved 2024",
        updated: new Date(), // optional, default = today
        generator: "Feed from Rin", // optional, default = 'Feed for Node.js'
        feedLinks: {
            rss: `${frontendUrl}/sub/rss.xml`,
            json: `${frontendUrl}/sub/rss.json`,
            atom: `${frontendUrl}/sub/atom.xml`
        }
    });
    const feed_list = await db.query.feeds.findMany({
        where: and(eq(feeds.draft, 0), eq(feeds.listed, 1)),
        orderBy: [desc(feeds.createdAt), desc(feeds.updatedAt)],
        limit: 20,
        with: {
            user: {
                columns: { id: true, username: true, avatar: true }
            }
        }
    });
    for (const f of feed_list) {
        const { summary, content, user, ...other } = f;
        const file = await unified()
            .use(remarkParse)
            .use(remarkGfm)
            .use(remarkRehype)
            .use(rehypeStringify)
            .process(content)
        let contentHtml = file.toString()
        feed.addItem({
            title: other.title || "No title",
            id: other.id?.toString() || "0",
            link: `${frontendUrl}/feed/${other.id}`,
            date: other.createdAt,
            description: summary.length > 0 ? summary : content.length > 100 ? content.slice(0, 100) : content,
            content: contentHtml,
            author: [{ name: user.username }],
            image: extractImage(content) || user.avatar as string,
        });
    }
    // save rss.xml to s3
    console.log('save rss.xml to s3');
    const folder = env.S3_CACHE_FOLDER || 'cache/';
    async function save(name: string, data: string) {
        const hashkey = path.join(folder, name);
        try {
            await env.RIN_BUCKET.put(hashkey, data, {
                httpMetadata: {
                    contentType: 'application/rss+xml; charset=utf-8',
                    // RSS 每 20 分钟由 cron 重建并覆盖同 key，故缓存不宜过长；与 /sub 路由的
                    // Cache-Control 对齐，让经 CDN/公共地址直接访问时也能边缘命中且不长期陈旧。
                    cacheControl: 'public, max-age=300, s-maxage=600, stale-while-revalidate=600'
                }
            })
        } catch (e: any) {
            console.error(e.message)
        }
    }
    await save('rss.xml', feed.rss2());
    console.log('Saved atom.xml to s3');
    await save('atom.xml', feed.atom1());
    console.log('Saved rss.json to s3');
    await save('rss.json', feed.json1());
    console.log('Saved rss.xml to s3');
}
