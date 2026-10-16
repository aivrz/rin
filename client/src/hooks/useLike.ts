import { useEffect, useState } from "react";
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";

// 文章点赞：当列表/详情已返回 likes/liked 时，传 fetch:false 直接使用初始值，减少请求；
// 否则默认从 /feed/:id/like 拉取。点赞切换始终走 POST。
export function useLike(id: string, opts?: { count?: number; liked?: boolean; fetch?: boolean }) {
    const { count: initialCount = 0, liked: initialLiked = false, fetch: doFetch = true } = opts || {};
    const [count, setCount] = useState(initialCount);
    const [liked, setLiked] = useState(initialLiked);
    const [pending, setPending] = useState(false);

    useEffect(() => {
        if (!doFetch) return;
        client
            .feed({ id })
            .like.get({ headers: headersWithAuth() })
            .then(({ data, error }) => {
                if (!error && data && typeof data !== "string") {
                    const d = data as { count?: number; liked?: boolean };
                    if (typeof d.count === "number") setCount(d.count);
                    if (typeof d.liked === "boolean") setLiked(d.liked);
                }
            });
    }, [id, doFetch]);

    // 当列表/详情数据异步到达（fetch:false 模式）时，用最新的初始值同步，避免初始为 0 且不更新
    useEffect(() => {
        if (!doFetch) {
            setCount(initialCount);
            setLiked(initialLiked);
        }
    }, [doFetch, initialCount, initialLiked]);

    async function toggle(): Promise<boolean | null> {
        if (pending) return null;
        setPending(true);
        try {
            const { data, error } = await client
                .feed({ id })
                .like.post(undefined, { headers: headersWithAuth() });
            if (error) {
                setPending(false);
                return null;
            }
            const next = !!(data as { liked?: boolean })?.liked;
            setLiked(next);
            setCount((c) => c + (next ? 1 : -1));
            setPending(false);
            return next;
        } catch {
            setPending(false);
            return null;
        }
    }

    return { count, liked, toggle, pending };
}
