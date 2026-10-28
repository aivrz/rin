import { useCallback, useEffect, useState } from "react";
import { useRouter } from "wouter";

function currentLocation(base: string) {
    const { pathname, search } = window.location;
    return base && pathname.startsWith(base)
        ? pathname.slice(base.length) + search
        : pathname + search;
}

type NavigateOptions = { replace?: boolean; state?: unknown };

// 在 wouter 默认浏览器路由之上叠加「View Transitions」：
// 跳转时用 document.startViewTransition 包裹 DOM 更新，浏览器为旧→新快照做原生过渡，消除 SPA 跳页感。
//
// 关键：不能用 flushSync 同步提交。本项目路由组件均为 lazy() 懒加载，目标 chunk 未就绪时
// React 会在同步渲染中挂起并抛出 "A component suspended while responding to synchronous input"。
// 因此改为正常异步 setLocation，并让回调返回一个在提交后（rAF）才 resolve 的 Promise，
// 使过渡捕获已提交的 DOM（未预取时为 Suspense 骨架屏，符合预期），且绝不会因 Suspense 抛错中断导航。
// 旧浏览器（无 startViewTransition）自动回退为即时切换，行为不变。
export function useAnimatedLocation(): [string, (to: string, options?: NavigateOptions) => void] {
    const router = useRouter();
    const base = router.base || "";
    const [location, setLocation] = useState(() => currentLocation(base));

    useEffect(() => {
        const handler = () => {
            const next = currentLocation(base);
            const doc = document as unknown as {
                startViewTransition?: (cb: () => void | Promise<void>) => void;
            };
            if (doc.startViewTransition) {
                doc.startViewTransition(() => {
                    setLocation(next);
                    return afterCommit();
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
                startViewTransition?: (cb: () => void | Promise<void>) => void;
            };
            if (doc.startViewTransition) {
                doc.startViewTransition(() => {
                    apply();
                    return afterCommit();
                });
            } else {
                apply();
            }
        },
        [base]
    );

    return [location, navigate];
}

// 等待 React 异步提交完成后再让 View Transition 捕获「新」快照。
// 用 rAF 兜底一次 + setTimeout 兜底，确保 Promise 一定会 resolve（rAF 在后台标签不会触发）。
function afterCommit(): Promise<void> {
    return new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            resolve();
        };
        requestAnimationFrame(() => requestAnimationFrame(finish));
        setTimeout(finish, 120);
    });
}
