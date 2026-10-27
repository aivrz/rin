import i18n from "i18next";
import { client } from "../main";
import { headersWithAuth } from "./auth";
import { errorMessage } from "./errorMessage";

// 客户端硬上限与设置页/编辑器保持一致（5MB）；服务端另有 10MB 兜底。
const MAX_SIZE = 5 * 1024 * 1024;

// 扩展名 → 内容类型（与后端 IMAGE_EXT 对应，提供即时校验反馈）
const EXT_TYPE: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    avif: "image/avif",
};

function extFromName(name: string): string {
    const m = name.match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toLowerCase() : "";
}

/**
 * 统一图片上传入口（单一代理通道）：writing 与 settings 共用。
 * 流程：客户端即时校验（大小/类型/扩展名）→ POST /storage 由 Worker 转发字节到 R2。
 * 不依赖 R2 桶 CORS，行为确定、部署简单。异常以 Error(message) 抛出，由调用方统一展示。
 */
export async function uploadImageToR2(file: File): Promise<string> {
    const t = i18n.t;
    if (!file) throw new Error(t("upload.empty"));
    if (file.size > MAX_SIZE) throw new Error(t("upload.failed$size", { size: 5 }));
    const declared = file.type || "";
    if (!declared.startsWith("image/")) throw new Error(t("upload.failed$type"));
    // 扩展名优先取文件名，否则按类型反查；最终必须落在允许列表内
    let ext = extFromName(file.name);
    if (!EXT_TYPE[ext]) ext = Object.keys(EXT_TYPE).find(k => EXT_TYPE[k] === declared) || "";
    if (!ext || !EXT_TYPE[ext]) throw new Error(t("upload.failed$type"));

    try {
        const { data, error } = await client.storage.index.post(
            { key: file.name, file },
            { headers: headersWithAuth() }
        );
        if (error) throw new Error(t("upload.failed$message", { message: errorMessage(error) }));
        if (!data || typeof data !== "string" || !data.trim()) throw new Error(t("upload.empty"));
        return data.trim();
    } catch (e: any) {
        // 网络层失败（fetch 直接 reject，如断网/后端不可达）：Eden 不会给出 error 对象，
        // 这里给出可操作的网络提示，而非把底层 "Failed to fetch" 暴露给用户。
        if (!e?.message || e.message === "Failed to fetch" || e.message.toLowerCase().includes("fetch")) {
            throw new Error(t("upload.network"));
        }
        throw e;
    }
}
