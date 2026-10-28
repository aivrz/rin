import { useRef } from "react"
import { client } from "../main"
import { headersWithAuth } from "../utils/auth"

// 各懒加载页面对应的 chunk 动态导入：与 App.tsx 的 lazy() 使用同一模块路径，
// 浏览器模块缓存会自动去重——首次 import 触发下载，后续（含 lazy 真正挂载时）直接命中缓存。
const pageImports: Record<string, () => Promise<unknown>> = {
    feed: () => import("../page/feed"),
    writing: () => import("../page/writing"),
    settings: () => import("../page/settings"),
    friends: () => import("../page/friends"),
}

// 全局去重：同一 chunk 只触发一次下载，避免 hover 抖动造成请求风暴。
const chunkFetched = new Set<string>()

export function prefetchPage(name: keyof typeof pageImports) {
    if (chunkFetched.has(name)) return
    chunkFetched.add(name)
    pageImports[name]?.().catch(() => chunkFetched.delete(name))
}

// 文章正文渲染依赖 katex/代码高亮/mermaid 等重依赖（随 components/markdown 打包）。
// 单独成块后由 hover 预取，使 FeedPage 入口 chunk 大幅瘦身、骨架屏更早出现。
export function prefetchMarkdown() {
    if (chunkFetched.has('markdown')) return
    chunkFetched.add('markdown')
    import("../components/markdown").catch(() => chunkFetched.delete('markdown'))
}

// 文章详情数据预取缓存：hover 时并行预取 API，点击进入后由 feed.tsx 直接复用，避免重复请求。
const feedDataCache = new Map<string, Promise<unknown>>()

export function prefetchFeedData(id: string) {
    if (feedDataCache.has(id)) return
    feedDataCache.set(id, client.feed({ id }).get({ headers: headersWithAuth() }))
}

export function consumePrefetchedFeed(id: string): Promise<any> | undefined {
    const p = feedDataCache.get(id)
    if (p) {
        feedDataCache.delete(id)
        return p as Promise<any>
    }
    return undefined
}

// 返回可展开到任意元素上的事件处理器：hover / 键盘聚焦 / 触摸开始时各触发一次预取。
// 仅首次触发（done 守卫），之后无论哪个事件都不再重复；用于文章卡片、导航项等。
export function usePrefetch(fire: () => void) {
    const done = useRef(false)
    const run = () => {
        if (done.current) return
        done.current = true
        fire()
    }
    return { onMouseEnter: run, onFocus: run, onTouchStart: run }
}
