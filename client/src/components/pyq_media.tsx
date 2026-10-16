export type MediaItem = {
    type: "music" | "video";
    url: string;
    title?: string;
};

// 从正文里抽取「独占一行的媒体 URL」，并从正文中移除，避免重复渲染。
export function extractMedia(content: string): { media: MediaItem[], content: string } {
    const lines = content.split(/\r?\n/);
    const media: MediaItem[] = [];
    const audioRe = /\.(mp3|m4a|wav|ogg|flac)(\?[^)\s]*)?$/i;
    const kept: string[] = [];
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) { kept.push(raw); continue; }
        // 独占一行的媒体链接
        if (/^https?:\/\/\S+$/i.test(line)) {
            if (audioRe.test(line)) {
                media.push({ type: "music", url: line });
                continue;
            }
            if (/bilibili\.com\/video|b23\.tv|youtube\.com\/watch|youtube\.com\/shorts|youtu\.be|youku\.com|v\.qq\.com|douyin\.com/i.test(line)) {
                media.push({ type: "video", url: line });
                continue;
            }
        }
        kept.push(raw);
    }
    return { media, content: kept.join("\n") };
}

export function PyqMusicCard({ url, title }: { url: string, title?: string }) {
    return (
        <div className="pyq-music">
            <div className="pyq-music-cover"><i className="ri-music-2-line" /></div>
            <div className="pyq-music-info">
                <div className="pyq-music-title">{title || "音乐"}</div>
                <audio src={url} controls preload="none" />
            </div>
        </div>
    );
}

export function PyqVideoEmbed({ url }: { url: string }) {
    let embed: string | null = null;
    let host = "";
    try {
        const u = new URL(url);
        host = u.hostname;
        if (/bilibili\.com$/.test(u.hostname) || /b23\.tv$/.test(u.hostname)) {
            const m = u.pathname.match(/\/video\/(BV\w+)/);
            if (m) embed = `https://player.bilibili.com/player.html?bvid=${m[1]}&autoplay=0&high_quality=1`;
        } else if (/youtube\.com$/.test(u.hostname) || /youtu\.be$/.test(u.hostname)) {
            const id = u.searchParams.get("v") || u.pathname.split("/").pop();
            if (id) embed = `https://www.youtube.com/embed/${id}`;
        }
    } catch { /* ignore */ }
    if (embed) {
        return (
            <div className="pyq-video">
                <iframe className="pyq-content-video" src={embed} allowFullScreen
                    sandbox="allow-scripts allow-same-origin allow-presentation" />
            </div>
        );
    }
    return (
        <a className="pyq-video" href={url} target="_blank" rel="noreferrer"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", textDecoration: "none" }}>
            <span className="pyq-video-span"><i className="ri-play-line" /> {host || "视频"}</span>
        </a>
    );
}
