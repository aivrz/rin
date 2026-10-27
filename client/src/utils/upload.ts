import i18n from "i18next";
import { client } from "../main";
import { headersWithAuth } from "./auth";
import { errorMessage } from "./errorMessage";

// 客户端硬上限与设置页/编辑器保持一致（5MB）；服务端另有 10MB 兜底。
const MAX_SIZE = 5 * 1024 * 1024;

// 扩展名 → 内容类型（与后端 IMAGE_EXT 对应，保证 sign 请求 type 与 ext 严格一致）
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

function buf2hex(buffer: ArrayBuffer): string {
    return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function sha1Hex(buf: ArrayBuffer): Promise<string> {
    const h = await crypto.subtle.digest("SHA-1", buf);
    return buf2hex(h);
}

function extFromName(name: string): string {
    const m = name.match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toLowerCase() : "";
}

// XHR PUT 直传 R2：fetch 的 upload 进度在部分环境不可靠，XHR 可拿到真实进度且可中断。
function putDirect(uploadUrl: string, file: File, type: string, onProgress?: (p: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", type);
        if (onProgress) {
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) onProgress(e.loaded / e.total);
            };
        }
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`上传失败 (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("网络错误，上传失败"));
        xhr.send(file);
    });
}

/**
 * 统一图片上传入口（预签名直传版）：writing 与 settings 共用。
 * 流程：客户端算 SHA-1（天然去重）→ 向 /storage/sign 取限时 PUT URL → 直传 R2，
 * 字节不再绕经 Worker，省去代理上传的双倍流量与 CPU，并支持真实进度。
 * 异常以 Error(message) 抛出，由调用方用 showAlert 统一展示。
 */
export async function uploadImageToR2(file: File, onProgress?: (p: number) => void): Promise<string> {
    const t = i18n.t;
    if (!file) throw new Error(t("upload.empty"));
    if (file.size > MAX_SIZE) throw new Error(t("upload.failed$size", { size: 5 }));
    const declared = file.type || "";
    if (!declared.startsWith("image/")) throw new Error(t("upload.failed$type"));
    // 扩展名优先取文件名，否则按类型反查；最终必须落在允许列表内
    let ext = extFromName(file.name);
    if (!EXT_TYPE[ext]) ext = Object.keys(EXT_TYPE).find(k => EXT_TYPE[k] === declared) || "";
    if (!ext || !EXT_TYPE[ext]) throw new Error(t("upload.failed$type"));
    const type = EXT_TYPE[ext];
    const buf = await file.arrayBuffer();
    const hash = await sha1Hex(buf);
    const { data, error } = await client.storage.sign.post(
        { hash, ext, type },
        { headers: headersWithAuth() }
    );
    if (error) throw new Error(t("upload.failed$message", { message: errorMessage(error) }));
    // data 可能是错误字符串（配置缺失/403/400 文案）或成功对象，需先排除字符串分支
    if (!data || typeof data === "string" || !data.uploadUrl) throw new Error(t("upload.empty"));
    await putDirect(data.uploadUrl, file, type, onProgress);
    return data.publicUrl;
}
