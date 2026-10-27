-- P2-1 接口限流计数表：配合 utils/ratelimit.ts，按 key（${route}:${ip}）记录窗口内请求数。
-- IF NOT EXISTS 幂等，migrator 仅对版本 > 当前迁移版本的文件执行一次。
CREATE TABLE IF NOT EXISTS ratelimit (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    expires INTEGER NOT NULL
);
