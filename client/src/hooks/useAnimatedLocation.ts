import { useCallback, useSyncExternalStore } from "react";
import { useRouter } from "wouter";

// wouter 内部对 history.pushState/replaceState 做了 monkey-patch，会派发同名事件；
// 配合 useSyncExternalStore 订阅这些事件，所有 useLocation 消费者共享同一外部 store（window.location），
// 这样 navigate 修改 URL 后 Switch 等所有消费者才会同步更新——导航才能真正切换路由。
// 之前用 useState 做 location 是每组件独立实例，Switch 那份状态永远不更新，导致点链接切不了页。
const LOCATION_EVENTS = ["popstate", "pushState", "replaceState", "hashchange"];

type NavigateOptions = { replace?: boolean; state?: unknown };

// 在 wouter 默认浏览器路由之上叠加「View Transitions」：
// 跳转时用 document.startViewTransition 包裹 DOM 更新，浏览器为旧→新快照做原生过渡，消除 SPA 跳页感。
// 用 useSyncExternalStore（共享 store）而非本地 useState，保证导航生效；不强制 flushSync，
// 避免懒加载路由在同步渲染中挂起抛出 "A component suspended while responding to synchronous input"。
// 旧浏览器（无 startViewTransition）自动回退为即时切换，行为不变。
export function useAnimatedLocation(): [string, (to: string, options?: NavigateOptions) => void] {
    const router = useRouter();
    const base = router.base || "";

    const subscribe = useCallback((cb: () => void) => {
        for (const e of LOCATION_EVENTS) window.addEventListener(e, cb);
        return () => {
            for (const e of LOCATION_EVENTS) window.removeEventListener(e, cb);
        };
    }, []);

    const getSnapshot = useCallback(() => {
        const { pathname, search } = window.location;
        return base && pathname.startsWith(base)
            ? pathname.slice(base.length) + search
            : pathname + search;
    }, [base]);

    // 订阅同一外部 store：URL 变化时所有消费者一起重渲染
    const location = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    const navigate = useCallback(
        (to: string, options?: NavigateOptions) => {
            const url = new URL(to, window.location.href);
            const target = url.pathname + url.search;
            const stateOpt = options?.state !== undefined ? { state: options.state } : undefined;
            const apply = () => {
                if (options?.replace) {
                    history.replaceState(stateOpt, "", target);
                } else {
                    history.pushState(stateOpt, "", target);
                }
            };
            const doc = document as unknown as {
                startViewTransition?: (cb: () => void | Promise<void>) => void;
            };
            if (doc.startViewTransition) {
                doc.startViewTransition(() => {
                    apply();
                    // 让 React 异步提交完成后再捕获「新」快照（未预取时为 Suspense 骨架屏，符合预期）
                    return afterCommit();
                });
            } else {
                apply();
            }
        },
        []
    );

    return [location, navigate];
}

// 等待 React 异步提交完成后再让 View Transition 捕获「新」快照。
// rAF 兜底一次 + setTimeout 兜底，确保 Promise 一定会 resolve（后台标签 rAF 不会触发）。
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
