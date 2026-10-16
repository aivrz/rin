export function extractImage(content: string) {
    const img_reg = /!\[.*?\]\((.*?)\)/;
    const img_match = img_reg.exec(content);
    let avatar: string | undefined = undefined;
    if (img_match) {
        avatar = img_match[1];
    }
    return avatar;
}

/**
 * 提取正文中全部图片地址（仿 pyq 的九宫格：最多 9 张）。
 * 与 extractImage 共用 Markdown 图片语法；去重避免重复出图。
 * @param content  Markdown 正文
 * @param limit    最大张数（默认 9，对应朋友圈九宫格）
 */
export function extractImages(content: string, limit = 9): string[] {
    const reg = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = reg.exec(content)) !== null) {
        const url = m[1]?.trim();
        if (url && !out.includes(url)) out.push(url);
        if (out.length >= limit) break;
    }
    return out;
}