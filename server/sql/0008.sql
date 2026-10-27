-- P1-2 高频查询索引：feed 列表/计数、点赞聚合与点赞态、按文章查评论、按 alias 查 feed。
-- 全部 IF NOT EXISTS，可重复执行（migrator 仅对版本 > 当前迁移版本的文件执行一次）。
-- 注意：本文件建索引须用数据库真实列名（蛇形），而非 drizzle 属性名（驼峰）。
-- feeds 表列：id, alias, title, content, summary, listed, draft, uid, created_at, updated_at, pv, uv
--   （top 列由 schema 定义、经 push 落入库，线上代码已在用，故索引包含 top）
-- likes 表列：id, feed_id, user_id, created_at
-- comments 表列：id, feed_id, user_id, content, created_at, updated_at

-- feed 列表：WHERE draft=? AND listed=? ORDER BY top DESC, created_at DESC, updated_at DESC（+ 同条件 count()）。
-- 复合索引以等值筛选列(draft, listed)为前缀、排序列(top, created_at, updated_at)在后，
-- 让过滤与排序尽量下推到索引，避免每次列表/计数全表扫描 + 排序。
CREATE INDEX IF NOT EXISTS idx_feeds_list ON feeds(draft, listed, top, created_at, updated_at);

-- 点赞：feed.ts 对列表批量聚合 likes(feed_id IN (...))，以及当前用户点赞态 likes(feed_id, user_id)。
-- 复合索引 (feed_id, user_id) 的 feed_id 前缀即可覆盖 feed_id 单列聚合查询。
CREATE INDEX IF NOT EXISTS idx_likes_feedId_userId ON likes(feed_id, user_id);

-- 评论：按文章查评论列表与评论计数（comments.feed_id）。
CREATE INDEX IF NOT EXISTS idx_comments_feedId ON comments(feed_id);

-- 按 alias 查 feed：feed.ts 用 or(eq(id, x), eq(alias, x))，id 走主键，alias 需本索引。
CREATE INDEX IF NOT EXISTS idx_feeds_alias ON feeds(alias);
