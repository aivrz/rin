ALTER TABLE `users` ADD COLUMN `weixinid` text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `oauth_identities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`provider` text NOT NULL,
	`openid` text NOT NULL,
	`avatar` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ews_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scene_id` text,
	`openid` text,
	`unionid` text,
	`access_token` text,
	`nickname` text,
	`avatar` text,
	`create_time` text,
	`update_time` text
);
--> statement-breakpoint
INSERT INTO `info` (`key`, `value`) VALUES ('migration_version', '3');
