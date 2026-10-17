-- 评论支持层级嵌套：新增 parent_id 列，指向被回复的父评论（顶层评论为 NULL）
ALTER TABLE comments ADD COLUMN parent_id INTEGER;
-- 加速按父评论查询子回复
CREATE INDEX IF NOT EXISTS idx_comments_parentId ON comments(parent_id);
