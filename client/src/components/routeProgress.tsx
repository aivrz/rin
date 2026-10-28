import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

// 顶栏路由切换进度条：点击链接跳转到懒加载路由（需下载 chunk）时，给出连续进度反馈，
// 即便有微延迟也「不卡、有响应」。骨架屏负责内容占位，进度条负责「系统在处理」的感知。
export function RouteProgress() {
    const [location] = useLocation();
    const [active, setActive] = useState(false);
    const [width, setWidth] = useState(0);
    const interval = useRef<number | undefined>(undefined);
    const finishTimer = useRef<number | undefined>(undefined);

    useEffect(() => {
        setActive(true);
        setWidth(8);
        window.clearInterval(interval.current);
        interval.current = window.setInterval(() => {
            setWidth((w) => Math.min(w + Math.random() * 12, 90));
        }, 120);
        window.clearTimeout(finishTimer.current);
        finishTimer.current = window.setTimeout(() => {
            window.clearInterval(interval.current);
            setWidth(100);
            window.setTimeout(() => {
                setActive(false);
                setWidth(0);
            }, 250);
        }, 350);
        return () => {
            window.clearTimeout(finishTimer.current);
            window.clearInterval(interval.current);
        };
    }, [location]);

    if (!active) return null;
    return <div className="rin-progress" style={{ width: `${width}%` }} aria-hidden="true" />;
}
