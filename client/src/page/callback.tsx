import { useEffect } from "react";
import { setCookie } from "typescript-cookie";
import { useSearch } from "wouter";
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";

export function CallbackPage() {
    const searchParams = new URLSearchParams(useSearch());
    useEffect(() => {
        const token = searchParams.get('token');
        if (token) {
            // 服务端 JWT 无 exp，会话寿命由该 cookie 决定；30 天避免隔周回来必遇 Unauthorized。
            setCookie('token', token, { expires: 30, path: '/' })
            // token 写在自身（前端）域名后，通知 App 重新拉取 profile，避免客户端跳转后 profile 仍为
            // undefined 导致管理员进不去后台。
            window.dispatchEvent(new Event('rin:login'))
            // 拉取当前用户，决定跳转目标。这里用整页跳转（而非 wouter 客户端导航）确保 App 重新挂载、
            // 以最新 token 重新拉取 profile 并正确结束加载态，避免卡在 /writing 的「加载中」。
            client.user.profile.get({
                headers: headersWithAuth()
            }).then(({ data }) => {
                // 评论流程触发登录时，记下原文章页，登录后跳回以保留评论草稿
                const redirect = sessionStorage.getItem('rin_post_login_redirect');
                if (redirect && redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.includes(':')) {
                    sessionStorage.removeItem('rin_post_login_redirect');
                    window.location.assign(redirect);
                } else if (data && typeof data !== 'string' && data.permission) {
                    window.location.assign("/settings");
                } else {
                    window.location.assign("/");
                }
            }).catch(() => window.location.assign("/"));
        } else {
            window.location.assign("/");
        }
    }, [searchParams]);
    return (<>
        <div className="w-screen h-screen flex justify-center items-center">
            <div className="text-center text-black p-4 text-xl font-bold">
                <p>
                    Waiting...
                </p>
            </div>
        </div>
    </>)
}
