-- 匿名点赞写入稳定的负整数 anonUid（不在 users 表中），原 user_id 外键会导致
-- FOREIGN KEY constraint failed。此处去掉该外键（feeds 外键保留），匿名点赞即可落库。
CREATE TABLE `likes_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`feed_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `likes_new` (`id`, `feed_id`, `user_id`, `created_at`) SELECT `id`, `feed_id`, `user_id`, `created_at` FROM `likes`;
--> statement-breakpoint
DROP TABLE `likes`;
--> statement-breakpoint
ALTER TABLE `likes_new` RENAME TO `likes`;
