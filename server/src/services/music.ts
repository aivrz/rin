import Elysia from 'elysia';

// 网易云音乐薄代理：不自写 weapi，改为转发 Meting API（音频经本 Worker 流式代理，带 Referer，
// 规避浏览器端 CORS 与直链失效）。
//
// 用实例列表而不是写死单个域名：公益实例随时可能停服或域名失效——
// api.i-meting.com 已 ENOTFOUND，api.mizk.cn / api.tune-api.com 同样解析失败。
// 单点写死会让「音乐不可用」变成只能翻 Worker 日志才能定位的问题。
// METING_API 环境变量可指定逗号分隔的实例列表，生产环境强烈建议指向自建实例。
const DEFAULT_METING_APIS = ['https://api.injahow.cn/meting/'];

function metingApis(): string[] {
    const custom = (process.env.METING_API || '').split(',').map((s) => s.trim()).filter(Boolean);
    const list = custom.length > 0 ? custom : DEFAULT_METING_APIS;
    return list.map((u) => u.replace(/\/+$/, ''));
}

/** 把底层 fetch 异常翻译成可读原因（DNS 失效 / 超时 / HTTP 状态），用于日志与响应 detail */
function describeError(e: any): string {
    if (e?.name === 'AbortError') return 'timeout';
    const msg = e?.message || String(e);
    const code = e?.cause?.code || e?.code;
    return code ? `${msg} (${code})` : msg;
}

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

/** 依次尝试各实例，返回首个成功结果；全部失败时抛出聚合了每个实例原因的错误 */
async function metingGet(params: Record<string, string>, timeoutMs = 8000): Promise<any> {
    const qs = new URLSearchParams(params).toString();
    const failures: string[] = [];
    for (const base of metingApis()) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(`${base}?${qs}`, {
                signal: ctrl.signal,
                headers: { 'User-Agent': 'Mozilla/5.0' },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e: any) {
            failures.push(`${base} -> ${describeError(e)}`);
            console.warn('meting instance failed, trying next', base, describeError(e));
        } finally {
            clearTimeout(timer);
        }
    }
    throw new Error(`all meting instances failed: ${failures.join('; ')}`);
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

/**
 * 取歌曲 id。
 *
 * Meting 返回的歌曲对象**没有 id 字段**，可用字段只有 name / artist / url / pic / lrc；
 * 歌曲 id 只出现在这些地址的查询参数里，形如 `...&type=url&id=1303026047`。
 * 早期版本误读 `s.id`，导致每首歌 id 都是字符串 "undefined"，
 * 前端拼出 /music/netease/url/undefined 而 404 —— 表现为「歌名能显示但永远没声音」。
 */
function songIdOf(s: any): string {
    for (const field of ['url', 'lrc', 'pic']) {
        const m = String(s?.[field] || '').match(/[?&]id=(\d+)/);
        if (m) return m[1];
    }
    // 兼容个别自建 Meting 可能直接给 id 的情况
    return s?.id === undefined || s?.id === null ? '' : String(s.id);
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
                    // 极简风格不取封面：少一次外部图片请求，也避免把访客 IP 暴露给第三方图床。
                    // songIdOf 仍会从 pic 的查询参数里兜底解析 id（纯字符串解析，不产生请求）。
                    const list = songList(data).map((s: any) => ({
                        id: songIdOf(s),
                        name: s.name || '未知',
                        artist: Array.isArray(s.artist)
                            ? s.artist.join('/')
                            : s.artist || '未知歌手',
                    }));
                    // 单曲天然是单元素列表，专辑按其歌曲列表解析，结构对前端保持一致
                    const out = { name: REF_LABEL[ref.type], list };
                    playlistCache.set(cacheKey, { ts: Date.now(), data: out });
                    return out;
                } catch (e: any) {
                    const detail = describeError(e);
                    console.error('netease resolve failed', ref, detail);
                    set.status = 502;
                    // 必须带上真实原因：最常见的故障是公益实例域名失效（ENOTFOUND），
                    // 只回一句 resolve failed 会让人误以为是站点代码的问题
                    return { error: 'resolve failed', detail };
                }
            })
            .get('/netease/url/:id', async ({ set, params, request }) => {
                const id = params.id;
                let audioUrl: string | null = null;
                let resolveDetail = '';
                try {
                    const data = await metingGet({ server: 'netease', type: 'song', id });
                    audioUrl = firstUrl(data);
                } catch (e: any) {
                    resolveDetail = describeError(e);
                    console.error('netease url resolve failed', resolveDetail);
                }
                if (!audioUrl) {
                    set.status = 404;
                    return { error: 'not found', detail: resolveDetail || 'no url returned' };
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
