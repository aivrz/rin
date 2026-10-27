import { useEffect, useRef, useState } from "react";
import { setCookie } from "typescript-cookie";
import { useServerConfig } from "../state/config";
import { useLocation } from "wouter";
import { client, endpoint } from "../main";
import { headersWithAuth } from "../utils/auth";

// 关注公众号扫码登录面板（erphp-weixin-scan 整合前端部分）。
// 流程：展示关注二维码 → 用户关注并回复“登录”获取 6 位验证码 → 输入验证码 → 轮询 /ews/login。
export function ScanPanel() {
    // 优先读取服务端配置 store：后台保存二维码地址后立即生效，无需重开面板 / 刷新
    const serverConfig = useServerConfig();
    const [, setLocation] = useLocation();
    const storedQr = serverConfig?.get<string>('ews_qrcode_url') || "";
    const [fetchedQr, setFetchedQr] = useState("");
    const [code, setCode] = useState("");
    const [msg, setMsg] = useState("");
    const [polling, setPolling] = useState(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        // 兜底：若 store 尚未加载（用户未进过设置页），从公开接口拉取一次
        fetch(`${endpoint}/ews/qrcode`)
            .then(r => r.json())
            .then((d: any) => { if (d && d.qrcodeUrl) setFetchedQr(d.qrcodeUrl); })
            .catch(() => { });
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    // store 有值优先（实时），否则用兜底拉取的结果
    const qrcode = storedQr || fetchedQr;

    const startLogin = () => {
        if (!code || polling) return;
        setPolling(true);
        setMsg("正在验证…");
        let attempts = 0;
        timerRef.current = setInterval(async () => {
            attempts++;
            try {
                const res = await fetch(`${endpoint}/ews/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code }),
                });
                const d: any = await res.json();
                if (d?.status === 1) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    setPolling(false);
                    setMsg("登录成功，正在刷新…");
                    // 跨域登录：后端下发的 Set-Cookie 默认不会跨站落盘，故前端显式在自身域写入 token，
                    // 与 GitHub OAuth（callback.tsx）保持一致，确保刷新后 document.cookie 可读到 token。
                    // 服务端 JWT 无 exp，会话寿命由该 cookie 决定，与 callback.tsx 同步用 30 天。
                    if (d.token) setCookie('token', d.token, { expires: 30, path: '/' });
                    // token 写入前端域名后通知 App 刷新 profile（rin:login 触发 refreshProfile）
                    window.dispatchEvent(new Event('rin:login'));
                    // 管理员登录后客户端导航直接进后台设置页（不整页刷新）；普通用户仍停留在当前页刷新
                    client.user.profile.get({ headers: headersWithAuth() }).then(({ data }) => {
                        if (data && typeof data !== 'string' && data.permission) {
                            setLocation('/settings');
                        } else {
                            window.location.reload();
                        }
                    }).catch(() => window.location.reload());
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
