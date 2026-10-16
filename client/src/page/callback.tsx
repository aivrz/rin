import { useEffect } from "react";
import { setCookie } from "typescript-cookie";
import { useLocation, useSearch } from "wouter";
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";

export function CallbackPage() {
    const searchParams = new URLSearchParams(useSearch());
    const [_, setLocation] = useLocation();
    useEffect(() => {
        const token = searchParams.get('token');
        if (token) {
            setCookie('token', token, { expires: 7, path: '/' })
            // 拉取当前用户，管理员跳转到写作/管理界面，其余回首页
            client.user.profile.get({
                headers: headersWithAuth()
            }).then(({ data }) => {
                // 评论流程触发登录时，记下原文章页，登录后跳回以保留评论草稿
                const redirect = sessionStorage.getItem('rin_post_login_redirect');
                if (redirect && redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.includes(':')) {
                    sessionStorage.removeItem('rin_post_login_redirect');
                    setLocation(redirect);
                } else if (data && typeof data !== 'string' && data.permission) {
                    setLocation("/writing");
                } else {
                    setLocation("/");
                }
            }).catch(() => setLocation("/"));
        } else {
            setLocation("/");
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
