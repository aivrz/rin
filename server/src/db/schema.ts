import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const created_at = integer("created_at", { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull();
const updated_at = integer("updated_at", { mode: 'timestamp' }).default(sql`(unixepoch())`).notNull();

// 接口限流计数（P2-1）：按 key（通常为 `${route}:${ip}`）记录窗口内请求次数，过期由 expires 控制。
// 选 D1 而非 KV：写额度更宽裕（10 万/日 vs KV 1000/日），且跨 Worker 实例全局一致。
export const ratelimit = sqliteTable("ratelimit", {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    expires: integer("expires").notNull(),
});

export const feeds = sqliteTable("feeds", {
    id: integer("id").primaryKey(),
    alias: text("alias"),
    title: text("title"),
    summary: text("summary").default("").notNull(),
    content: text("content").notNull(),
    listed: integer("listed").default(1).notNull(),
    draft: integer("draft").default(1).notNull(),
    top: integer("top").default(0).notNull(),
    uid: integer("uid").references(() => users.id).notNull(),
    pv: integer("pv").default(0).notNull(),
    uv: integer("uv").default(0).notNull(),
    createdAt: created_at,
    updatedAt: updated_at,
});

export const visits = sqliteTable("visits", {
    id: integer("id").primaryKey(),
    feedId: integer("feed_id").references(() => feeds.id, { onDelete: 'cascade' }).notNull(),
    ip: text("ip").notNull(),
    createdAt: created_at,
});

export const info = sqliteTable("info", {
    key: text("key").notNull().unique(),
    value: text("value").notNull(),
});

export const friends = sqliteTable("friends", {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    desc: text("desc"),
    avatar: text("avatar").notNull(),
    url: text("url").notNull(),
    uid: integer("uid").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    accepted: integer("accepted").default(0).notNull(),
    health: text("health").default("").notNull(),
    createdAt: created_at,
    updatedAt: updated_at,
});

export const users = sqliteTable("users", {
    id: integer("id").primaryKey(),
    username: text("username").notNull(),
    openid: text("openid").notNull(),
    avatar: text("avatar"),
    weixinid: text("weixinid"),
    permission: integer("permission").default(0),
    createdAt: created_at,
    updatedAt: updated_at,
});

// 多平台 OAuth 身份映射（GitHub/QQ/微信网页授权/微博/公众号扫码）
export const oauthIdentities = sqliteTable("oauth_identities", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
    provider: text("provider").notNull(), // 'github' | 'qq' | 'weixin' | 'weibo' | 'ews'
    openid: text("openid").notNull(),
    avatar: text("avatar"),
});

// 关注公众号登录：验证码（scene_id）与微信 openid 的临时映射，5 分钟有效
export const ewsLogs = sqliteTable("ews_logs", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sceneId: text("scene_id"),
    openid: text("openid"),
    unionid: text("unionid"),
    accessToken: text("access_token"),
    nickname: text("nickname"),
    avatar: text("avatar"),
    createTime: text("create_time"),
    updateTime: text("update_time"),
});

// 点赞（erphplogin 风格社交互动）：每一条记录表示某用户赞了某篇文章
export const likes = sqliteTable("likes", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    feedId: integer("feed_id").references(() => feeds.id, { onDelete: 'cascade' }).notNull(),
    userId: integer("user_id").notNull(),
    createdAt: created_at,
});

export const comments = sqliteTable("comments", {
    id: integer("id").primaryKey(),
    feedId: integer("feed_id").references(() => feeds.id, { onDelete: 'cascade' }).notNull(),
    userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    parentId: integer("parent_id"), // 回复父评论 id，顶层评论为 null
    content: text("content").notNull(),
    createdAt: created_at,
    updatedAt: updated_at,
});

export const hashtags = sqliteTable("hashtags", {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: created_at,
    updatedAt: updated_at,
});

export const feedHashtags = sqliteTable("feed_hashtags", {
    feedId: integer("feed_id").references(() => feeds.id, { onDelete: 'cascade' }).notNull(),
    hashtagId: integer("hashtag_id").references(() => hashtags.id, { onDelete: 'cascade' }).notNull(),
    createdAt: created_at,
    updatedAt: updated_at,
});

export const feedsRelations = relations(feeds, ({ many, one }) => ({
    hashtags: many(feedHashtags),
    user: one(users, {
        fields: [feeds.uid],
        references: [users.id],
    }),
    comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
    feed: one(feeds, {
        fields: [comments.feedId],
        references: [feeds.id],
    }),
    user: one(users, {
        fields: [comments.userId],
        references: [users.id],
    }),
    parent: one(comments, {
        fields: [comments.parentId],
        references: [comments.id],
    }),
    replies: many(comments),
}));

export const hashtagsRelations = relations(hashtags, ({ many }) => ({
    feeds: many(feedHashtags),
}));

export const feedHashtagsRelations = relations(feedHashtags, ({ one }) => ({
    feed: one(feeds, {
        fields: [feedHashtags.feedId],
        references: [feeds.id],
    }),
    hashtag: one(hashtags, {
        fields: [feedHashtags.hashtagId],
        references: [hashtags.id],
    }),
}));