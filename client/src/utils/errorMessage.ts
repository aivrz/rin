// 统一把后端错误体翻译成可行动的提示文案。后端写入接口（上传/保存）在非 2xx 时
// Eden Treaty 是 resolve 而非 reject，错误体在 error 字段；401 需明确告知重新登录。
export function errorMessage(err: any): string {
    if (!err) return '';
    // 401 优先翻译：后端只认 Authorization Bearer，JWT 签发无 exp，会话寿命完全由
    // 前端 token cookie 决定；cookie 过期/丢失时所有需登录的写入都会 401。
    const status = typeof err.status === 'number'
        ? err.status
        : (err.response && typeof err.response.status === 'number' ? err.response.status : undefined);
    if (status === 401) return '登录已过期或未登录，请点击右上角头像重新登录后再操作';
    if (typeof err === 'string') return err;
    if (err.value && typeof err.value === 'string') return err.value;
    if (err.message && typeof err.message === 'string') return err.message;
    return JSON.stringify(err);
}
