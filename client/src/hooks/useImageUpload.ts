import { useCallback, useRef, useState } from "react";
import i18n from "i18next";
import { uploadImageToR2 } from "../utils/upload";

/**
 * 统一图片上传钩子：封装 uploading 状态与失败归一，writing(粘贴/拖拽/选图) 与
 * settings(文件选择) 共用，消除各页面重复的上传状态管理与 try/catch。
 * - upload(file) 返回 url（成功）或 null（失败，错误已通过 onError 提示）。
 * - 不自动重试：一次失败即提示，由用户重新操作（与全局上传策略一致）。
 *
 * @param onError 失败回调，默认直接用 showAlert 展示归一后的文案（含 401 重新登录指引）。
 */
export function useImageUpload(onError?: (msg: string) => void) {
    const [uploading, setUploading] = useState(false);
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    const upload = useCallback(async (file: File): Promise<string | null> => {
        setUploading(true);
        try {
            return await uploadImageToR2(file);
        } catch (e: any) {
            onErrorRef.current?.(e?.message || i18n.t("upload.failed"));
            return null;
        } finally {
            setUploading(false);
        }
    }, []);

    return { uploading, upload };
}
