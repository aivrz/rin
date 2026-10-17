import Elysia from 'elysia';

// 网易云音乐薄代理：不自写 weapi，改为转发 Meting API（默认公开实例，可用 METING_API 环境变量指向自托管实例）。
// 歌单解析由其完成；音频经本 Worker 流式代理（带 Referer），规避浏览器端 CORS 与直链失效。
const METING_API = (process.env.METING_API || 'https://api.i-meting.com/api').replace(/\/+$/, '');

// Worker 隔离环境内的短 TTL 内存缓存，降低对 Meting API 的调用频率（歌单变更不频繁）。
const playlistCache = new Map<string, { ts: number; data: any }>();
const PLAYLIST_TTL = 1000 * 60 * 30;

function extractPlaylistId(link: string): string | null {
    if (!link) return null;
    const m =
        link.match(/playlist\?id=(\d+)/) ||
        link.match(/playlist\/(\d+)/) ||
        link.match(/[?&]id=(\d+)/);
    return m ? m[1] : null;
}

async function metingGet(params: Record<string, string>, timeoutMs = 8000): Promise<any> {
    const qs = new URLSearchParams(params).toString();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(`${METING_API}?${qs}`, {
            signal: ctrl.signal,
            headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (!res.ok) throw new Error(`Meting API ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

function firstUrl(data: any): string | null {
    if (!data) return null;
    const arr = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
            ? data.data
            : [data];
    for (const item of arr) {
        if (item && item.url) return item.url as string;
    }
    return null;
}

function songList(data: any): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.list)) return data.list;
    return [];
}

export function MusicService() {
    return new Elysia({ aot: false }).group('/music', (group) =>
        group
            .get('/netease/playlist', async ({ set, query }) => {
                const link = (query.url as string) || '';
                const pid = extractPlaylistId(link);
                if (!pid) {
                    set.status = 400;
                    return { error: 'invalid playlist url' };
                }
                const cached = playlistCache.get(pid);
                if (cached && Date.now() - cached.ts < PLAYLIST_TTL) {
                    return cached.data;
                }
                try {
                    const data = await metingGet({ server: 'netease', type: 'playlist', id: pid });
                    const list = songList(data).map((s: any) => ({
                        id: String(s.id),
                        name: s.name || '未知',
                        artist: Array.isArray(s.artist)
                            ? s.artist.join('/')
                            : s.artist || '未知歌手',
                        cover: s.cover || '',
                    }));
                    const out = { name: '网易云歌单', list };
                    playlistCache.set(pid, { ts: Date.now(), data: out });
                    return out;
                } catch (e) {
                    console.error('netease playlist resolve failed', e);
                    set.status = 502;
                    return { error: 'resolve failed' };
                }
            })
            .get('/netease/url/:id', async ({ set, params, request }) => {
                const id = params.id;
                let audioUrl: string | null = null;
                try {
                    const data = await metingGet({ server: 'netease', type: 'song', id });
                    audioUrl = firstUrl(data);
                } catch (e) {
                    console.error('netease url resolve failed', e);
                }
                if (!audioUrl) {
                    set.status = 404;
                    return { error: 'not found' };
                }
                const range = request.headers.get('range') || undefined;
                let upstream: Response;
                try {
                    upstream = await fetch(audioUrl, {
                        headers: {
                            Referer: 'https://music.163.com/',
                            'User-Agent': 'Mozilla/5.0',
                            ...(range ? { Range: range } : {}),
                        },
                    });
                } catch (e) {
                    console.error('netease audio fetch failed', e);
                    set.status = 502;
                    return { error: 'fetch failed' };
                }
                if (!upstream.ok && upstream.status !== 206) {
                    set.status = 502;
                    return { error: 'upstream error' };
                }
                const headers: Record<string, string> = {
                    'Content-Type': upstream.headers.get('Content-Type') || 'audio/mpeg',
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'public, max-age=600',
                };
                const cl = upstream.headers.get('Content-Length');
                const cr = upstream.headers.get('Content-Range');
                if (cl) headers['Content-Length'] = cl;
                if (cr) headers['Content-Range'] = cr;
                return new Response(upstream.body, {
                    status: upstream.status,
                    headers,
                });
            })
    );
}
