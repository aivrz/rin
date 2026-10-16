import { useEffect, useRef, useState } from "react";

// 关注公众号扫码登录面板（erphp-weixin-scan 整合前端部分）。
// 流程：展示关注二维码 → 用户关注并回复“登录”获取 6 位验证码 → 输入验证码 → 轮询 /ews/login。
export function ScanPanel() {
    const [qrcode, setQrcode] = useState("");
    const [code, setCode] = useState("");
    const [msg, setMsg] = useState("");
    const [polling, setPolling] = useState(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        fetch("/ews/qrcode")
            .then(r => r.json())
            .then((d: any) => { if (d && d.qrcodeUrl) setQrcode(d.qrcodeUrl); })
            .catch(() => { });
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    const startLogin = () => {
        if (!code || polling) return;
        setPolling(true);
        setMsg("正在验证…");
        let attempts = 0;
        timerRef.current = setInterval(async () => {
            attempts++;
            try {
                const res = await fetch("/ews/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code }),
                });
                const d: any = await res.json();
                if (d?.status === 1) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    setPolling(false);
                    setMsg("登录成功，正在刷新…");
                    setTimeout(() => window.location.reload(), 800);
                } else if (attempts > 30) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    setPolling(false);
                    setMsg(d?.message || "验证失败或验证码已过期，请重新获取");
                }
            } catch {
                // 网络抖动时继续轮询
            }
        }, 2000);
    };

    return (
        <div className="w-full flex flex-col items-center gap-2 pt-2 border-t"
            style={{ borderColor: "var(--fgxys)" }}>
            <p className="text-xs" style={{ color: "var(--texths)" }}>关注公众号扫码登录</p>
            {qrcode
                ? <img src={qrcode} alt="关注二维码" className="w-32 h-32 object-contain" referrerPolicy="no-referrer" />
                : <div className="w-32 h-32 flex items-center justify-center text-xs"
                    style={{ background: "var(--imgbgy)", color: "var(--texths)", borderRadius: 8 }}>
                    未配置二维码
                </div>}
            <p className="text-xs text-center" style={{ color: "var(--texths)" }}>
                微信扫描关注后，回复“登录”获取 6 位验证码
            </p>
            <div className="flex flex-row items-center gap-2 w-full">
                <input
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="验证码"
                    inputMode="numeric"
                    className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: "var(--bganh)", color: "var(--textqh)", border: "1px solid var(--fgxys)" }}
                />
                <button
                    onClick={startLogin}
                    disabled={!code || polling}
                    className="rounded-lg px-4 py-2 text-sm text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ background: "var(--theme)" }}>
                    {polling ? "验证中…" : "登录"}
                </button>
            </div>
            {msg && <p className="text-xs" style={{ color: "var(--texths)" }}>{msg}</p>}
        </div>
    );
}
