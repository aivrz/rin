import Elysia from 'elysia';

// 网易云音乐薄代理：不自写 weapi，改为转发 Meting API（默认公开实例，可用 METING_API 环境变量指向自托管实例）。
// 歌单解析由其完成；音频经本 Worker 流式代理（带 Referer），规避浏览器端 CORS 与直链失效。
const METING_API = (process.env.METING_API || 'https://api.i-meting.com/api').replace(/\/+$/, '');

// Worker 隔离环境内的短 TTL 内存缓存，降低对 Meting API 的调用频率（歌单变更不频繁）。
const playlistCache = new Map<string, { ts: number; data: any }>();
const PLAYLIST_TTL = 1000 * 60 * 30;

type NeteaseRef = { type: 'playlist' | 'song' | 'album'; id: string };

// 各类链接在顶栏展示的兜底名称
const REF_LABEL: Record<NeteaseRef['type'], string> = {
    playlist: '网易云歌单',
    album: '网易云专辑',
    song: '网易云单曲',
};

// 从网易云链接解析出类型与 id，兼容以下形态（也兼容分享文案中夹带链接的情况）：
//   歌单 music.163.com/playlist?id=1 | /#/playlist?id=1 | /playlist/1
//   单曲 music.163.com/#/song?id=1   | /song/1   | /m/song?id=1
//   专辑 music.163.com/#/album?id=1  | /album/1  | /m/album?id=1
// 无法识别类型关键字时默认按歌单处理，保持对既往可用链接的向后兼容。
function parseNeteaseLink(link: string): NeteaseRef | null {
    if (!link) return null;
    const typeMatch = link.match(/(?:#\/|\/)(playlist|song|album)(?:[/?#]|$)/i);
    const type = (typeMatch ? typeMatch[1].toLowerCase() : 'playlist') as NeteaseRef['type'];
    const idMatch = link.match(/[?&]id=(\d+)/) || link.match(/\/(\d+)(?:[/?#]|$)/);
    if (!idMatch) return null;
    return { type, id: idMatch[1] };
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
                const ref = parseNeteaseLink(link);
                if (!ref) {
                    set.status = 400;
                    return { error: 'invalid netease link' };
                }
                // 不同类型可能撞同一个 id，故缓存键带上类型
                const cacheKey = `${ref.type}:${ref.id}`;
                const cached = playlistCache.get(cacheKey);
                if (cached && Date.now() - cached.ts < PLAYLIST_TTL) {
                    return cached.data;
                }
                try {
                    const data = await metingGet({ server: 'netease', type: ref.type, id: ref.id });
                    const list = songList(data).map((s: any) => ({
                        id: String(s.id),
                        name: s.name || '未知',
                        artist: Array.isArray(s.artist)
                            ? s.artist.join('/')
                            : s.artist || '未知歌手',
                        cover: s.cover || '',
                    }));
                    // 单曲天然是单元素列表，专辑按其歌曲列表解析，结构对前端保持一致
                    const out = { name: REF_LABEL[ref.type], list };
                    playlistCache.set(cacheKey, { ts: Date.now(), data: out });
                    return out;
                } catch (e) {
                    console.error('netease resolve failed', ref, e);
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
