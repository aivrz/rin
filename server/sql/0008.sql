-- P1-2 高频查询索引：feed 列表/计数、点赞聚合与点赞态、按文章查评论、按 alias 查 feed。
-- 全部 IF NOT EXISTS，可重复执行（migrator 仅对版本 > 当前迁移版本的文件执行一次）。

-- feed 列表：WHERE draft=? AND listed=? ORDER BY top DESC, createdAt DESC, updatedAt DESC（+ 同条件 count()）。
-- 复合索引以等值筛选列(draft, listed)为前缀、排序列(top, createdAt, updatedAt)在后，
-- 让过滤与排序尽量下推到索引，避免每次列表/计数全表扫描 + 排序。
CREATE INDEX IF NOT EXISTS idx_feeds_list ON feeds(draft, listed, top, createdAt, updatedAt);

-- 点赞：feed.ts 对列表批量聚合 likes(feedId IN (...))，以及当前用户点赞态 likes(feedId, userId)。
-- 复合索引 (feedId, userId) 的 feedId 前缀即可覆盖 feedId 单列聚合查询。
CREATE INDEX IF NOT EXISTS idx_likes_feedId_userId ON likes(feedId, userId);

-- 评论：按文章查评论列表与评论计数（comments.feedId）。
CREATE INDEX IF NOT EXISTS idx_comments_feedId ON comments(feedId);

-- 按 alias 查 feed：feed.ts 用 or(eq(id, x), eq(alias, x))，id 走主键，alias 需本索引。
CREATE INDEX IF NOT EXISTS idx_feeds_alias ON feeds(alias);
