import i18n from "i18next";
import { client } from "../main";
import { headersWithAuth } from "./auth";
import { errorMessage } from "./errorMessage";

// 客户端硬上限与设置页/编辑器保持一致（5MB）；服务端另有 10MB 兜底。
const MAX_SIZE = 5 * 1024 * 1024;

/**
 * 统一图片上传入口：writing（编辑器插图）与 settings（二维码/logo/banner）共用，
 * 消除两处重复的校验、错误归一与 URL 返回逻辑。异常以 Error(message) 形式抛出，
 * 由调用方用 showAlert 统一展示。
 */
export async function uploadImageToR2(file: File): Promise<string> {
    const t = i18n.t;
    if (!file) throw new Error(t("upload.empty"));
    if (file.size > MAX_SIZE) throw new Error(t("upload.failed$size", { size: 5 }));
    if (!file.type.startsWith("image/")) throw new Error(t("upload.failed$type"));
    const { data, error } = await client.storage.index.post(
        { key: file.name, file },
        { headers: headersWithAuth() }
    );
    if (error) throw new Error(t("upload.failed$message", { message: errorMessage(error) }));
    if (!data || typeof data !== "string" || !data.trim()) throw new Error(t("upload.empty"));
    return data.trim();
}
