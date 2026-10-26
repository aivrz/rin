/**
 * 计算 token cookie 需要的 Domain / Secure 后缀。
 *
 * 背景：前端（Pages）与 API（Worker）常部署在不同子域（如 www.100125.xyz 与
 * rinserver.100125.xyz）。原 Set-Cookie 未带 Domain，cookie 为主机作用域，前端页面的
 * document.cookie 读不到 token，于是 getCookie('token') 拿到 undefined，所有需要登录的
 * 写入（含存储上传 / 配置保存）都返回 401 Unauthorized。
 *
 * 这里把 Domain 设为注册域（主机名末两段），使同注册域的各子域都能读到该 cookie；
 * 走 HTTPS 时补 Secure（浏览器要求 SameSite=None/Secure 才跨站携带，此处仅 header 鉴权，
 * 但 Secure 是 HTTPS 站点下持久化 cookie 的硬性要求）。
 *
 * localhost / IP 返回空串：host-only cookie 在同源跨端口下天然可读，且 localhost 设
 * Domain 在部分浏览器行为不稳定，故不强加。
 */
export function cookieAttrs(request?: Request): string {
    if (!request) return '';
    const host = (request.headers.get('host') ?? '').split(':')[0].toLowerCase();
    const proto =
        request.headers.get('x-forwarded-proto') ??
        (request.url.startsWith('https') ? 'https' : 'http');
    let domain = '';
    if (host && host !== 'localhost' && !/^[\d.]+$/.test(host)) {
        const parts = host.split('.');
        // 取注册域（末两段）：rinserver.100125.xyz -> 100125.xyz，供 www / apex 等同域子域共享。
        // 对 .co.uk 等多段顶级域需额外处理；本仓库部署域为单段 TLD，末两段足够。
        if (parts.length > 2) domain = parts.slice(-2).join('.');
    }
    const secure = proto === 'https' ? '; Secure' : '';
    const dom = domain ? `; Domain=${domain}` : '';
    return `${dom}${secure}`;
}
