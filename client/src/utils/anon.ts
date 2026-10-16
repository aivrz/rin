const ANON_KEY = 'rin_anon_id';

// 生成本地持久匿名标识，用于免登录点赞时区分不同浏览器
export function getAnonId(): string {
    try {
        let id = localStorage.getItem(ANON_KEY);
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem(ANON_KEY, id);
        }
        return id;
    } catch {
        return 'anonymous';
    }
}
