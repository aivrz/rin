import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "wouter";

function currentLocation(base: string) {
    const { pathname, search } = window.location;
    return base && pathname.startsWith(base)
        ? pathname.slice(base.length) + search
        : pathname + search;
}

type NavigateOptions = { replace?: boolean; state?: unknown };

// 在 wouter 默认浏览器路由之上叠加「View Transitions」：
// 跳转时用 document.startViewTransition 包裹同步 DOM 更新（flushSync），
// 浏览器会为旧→新路由快照做原生过渡（淡入/位移），消除 SPA 切换的「跳页感」。
// 旧浏览器（无 startViewTransition）自动回退为即时切换，行为不变。
export function useAnimatedLocation(): [string, (to: string, options?: NavigateOptions) => void] {
    const router = useRouter();
    const base = router.base || "";
    const [location, setLocation] = useState(() => currentLocation(base));

    useEffect(() => {
        const handler = () => {
            const next = currentLocation(base);
            const doc = document as unknown as {
                startViewTransition?: (cb: () => void) => void;
            };
            if (doc.startViewTransition) {
                doc.startViewTransition(() => {
                    flushSync(() => setLocation(next));
                });
            } else {
                setLocation(next);
            }
        };
        window.addEventListener("popstate", handler);
        return () => window.removeEventListener("popstate", handler);
    }, [base]);

    const navigate = useCallback(
        (to: string, options?: NavigateOptions) => {
            const url = new URL(to, window.location.href);
            const stateOpt = options?.state !== undefined ? { state: options.state } : undefined;
            const apply = () => {
                if (options?.replace) {
                    history.replaceState(stateOpt, "", url);
                } else {
                    history.pushState(stateOpt, "", url);
                }
                setLocation(url.pathname + url.search);
            };
            const doc = document as unknown as {
                startViewTransition?: (cb: () => void) => void;
            };
            if (doc.startViewTransition) {
                doc.startViewTransition(() => {
                    flushSync(apply);
                });
            } else {
                apply();
            }
        },
        [base]
    );

    return [location, navigate];
}
