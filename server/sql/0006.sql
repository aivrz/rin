-- 详情页访问量改为计数列自增，避免每次请求全量扫描 visits 表（O(n) 危险）
ALTER TABLE feeds ADD COLUMN pv INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feeds ADD COLUMN uv INTEGER NOT NULL DEFAULT 0;
-- 加速 uv 去重判断（按 feed_id + ip 查询是否已有访问）
CREATE INDEX IF NOT EXISTS idx_visits_feedId ON visits(feed_id);
