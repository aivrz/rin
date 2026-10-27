import { useEffect } from "react";
import { setCookie } from "typescript-cookie";
import { useLocation, useSearch } from "wouter";

export function CallbackPage() {
    const searchParams = new URLSearchParams(useSearch());
    const [, setLocation] = useLocation();
    useEffect(() => {
        const token = searchParams.get('token');
        if (token) {
            // 服务端 JWT 无 exp，会话寿命由该 cookie 决定；30 天避免隔周回来必遇 Unauthorized。
            setCookie('token', token, { expires: 30, path: '/' })
            // token 写到前端域名后，App 挂载时的 refreshProfile() 会以最新 token 拉取 profile 并置
            // profileLoaded，AdminRoute 据此解除「加载中」并渲染后台（非管理员会被自动重定向首页）。
            // 这里不再单独发接口判断权限，改为客户端导航直接进 /settings，避免一次整页跳转 + 冗余请求。
            window.dispatchEvent(new Event('rin:login'))
            // 评论流程触发登录时，记下原文章页，登录后跳回以保留评论草稿（客户端导航，不整页刷新）
            const redirect = sessionStorage.getItem('rin_post_login_redirect');
            if (redirect && redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.includes(':')) {
                sessionStorage.removeItem('rin_post_login_redirect');
                setLocation(redirect);
            } else {
                // 管理员进后台；非管理员由 AdminRoute 自动重定向首页
                setLocation("/settings");
            }
        } else {
            setLocation("/");
        }
    }, [searchParams, setLocation]);
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
