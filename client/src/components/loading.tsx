import ReactLoading from "react-loading";

export function Waiting({ for: wait, children }: { for?: any, children?: React.ReactNode }) {
    return (
        <>
            {!wait ?
                <div className="w-full h-96 flex flex-col justify-center items-center mb-8 ani-show-fast">
                    <ReactLoading type="cylon" color="#FC466B" />
                </div>
                : children}
        </>
    )
}

// 路由级骨架屏：替换根 Suspense 的「加载中…」整页替换，使导航时 Header/Footer/布局保持常驻，
// 仅内容区显示占位骨架，消除点击导航时的「闪白/假死」卡顿观感。
export function PageSkeleton() {
    return (
        <div className="pyq-main ani-show-fast" aria-busy="true" aria-live="polite">
            <div className="pyq-card pyq-skeleton-card">
                <div className="pyq-skeleton-line" style={{ width: "40%", height: 22 }} />
                <div className="pyq-skeleton-line" style={{ width: "22%", height: 14, marginTop: 14 }} />
                <div className="pyq-skeleton-line" style={{ width: "100%" }} />
                <div className="pyq-skeleton-line" style={{ width: "96%" }} />
                <div className="pyq-skeleton-line" style={{ width: "92%" }} />
                <div className="pyq-skeleton-line" style={{ width: "70%" }} />
                <div className="pyq-skeleton-block" style={{ marginTop: 16 }} />
            </div>
        </div>
    )
}