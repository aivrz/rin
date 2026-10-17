import { desc, eq, or, inArray } from "drizzle-orm";
import Elysia, { t } from "elysia";
import type { DB } from "../_worker";
import type { Env } from "../db/db";
import { comments, feeds, users } from "../db/schema";
import { setup } from "../setup";
import { ServerConfig } from "../utils/config-store";
import { Config } from "../utils/config";
import { getDB, getEnv } from "../utils/di";
import { notify } from "../utils/webhook";
import { cdnHost, rewriteCdnStr } from "../utils/cdn";

export function CommentService() {
    const db: DB = getDB();
    const env: Env = getEnv();
    return new Elysia({ aot: false })
        .use(setup())
        .group('/feed/comment', (group) =>
            group
                .get('/:feed', async ({ params: { feed } }) => {
                    const f = await db.query.feeds.findFirst({
                        where: or(eq(feeds.id, parseInt(feed) || 0), eq(feeds.alias, feed))
                    });
                    if (!f) return [];
                    const comment_list = await db.query.comments.findMany({
                        where: eq(comments.feedId, f.id),
                        columns: { feedId: false, userId: false },
                        with: {
                            user: {
                                columns: { id: true, username: true, avatar: true, permission: true }
                            }
                        },
                        orderBy: [desc(comments.createdAt)]
                    });
                    const env = getEnv();
                    const cdn = await cdnHost(env);
                    const from = env.S3_ACCESS_HOST;
                    return comment_list.map((c: any) => ({ ...c, user: c.user ? { ...c.user, avatar: rewriteCdnStr(c.user.avatar, cdn, from) } : c.user }));
                })
                .post('/:feed', async ({ uid, set, params: { feed }, body: { content, parentId } }) => {
                    if (!uid) {
                        set.status = 401;
                        return 'Unauthorized';
                    }
                    if (!content) {
                        set.status = 400;
                        return 'Content is required';
                    }
                    const f = await db.query.feeds.findFirst({
                        where: or(eq(feeds.id, parseInt(feed) || 0), eq(feeds.alias, feed))
                    });
                    const feedId = f?.id;
                    if (!feedId) {
                        set.status = 400;
                        return 'Feed not found';
                    }
                    const userId = parseInt(uid);
                    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
                    if (!user) {
                        set.status = 400;
                        return 'User not found';
                    }
                    // 回复场景：校验父评论存在且属于同一 feed
                    if (parentId !== undefined && parentId !== null) {
                        const parent = await db.query.comments.findFirst({ where: eq(comments.id, parentId) });
                        if (!parent || parent.feedId !== feedId) {
                            set.status = 400;
                            return 'Parent comment not found';
                        }
                    }
                    await db.insert(comments).values({
                        feedId,
                        userId,
                        parentId: parentId ?? null,
                        content
                    });

                    const webhookUrl = await ServerConfig().get(Config.webhookUrl) || env.WEBHOOK_URL;
                    // notify
                    await notify(webhookUrl, `${env.FRONTEND_URL}/feed/${feedId}\n${user.username} 评论了: ${f!.title}\n${content}`);
                    return 'OK';
                }, {
                    body: t.Object({
                        content: t.String(),
                        parentId: t.Optional(t.Number())
                    })
                })
        )
        .group('/comment', (group) =>
            group
                .delete('/:id', async ({ uid, admin, set, params: { id } }) => {
                    if (uid === undefined) {
                        set.status = 401;
                        return 'Unauthorized';
                    }
                    const id_num = parseInt(id);
                    const comment = await db.query.comments.findFirst({ where: eq(comments.id, id_num) });
                    if (!comment) {
                        set.status = 404;
                        return 'Not found';
                    }
                    if (!admin && comment.userId !== parseInt(uid)) {
                        set.status = 403;
                        return 'Permission denied';
                    }
                    // 收集目标评论及其全部子孙 id，连同父评论一并删除，避免留下孤儿节点
                    const all = await db.query.comments.findMany({ where: eq(comments.feedId, comment.feedId) });
                    const childrenMap = new Map<number, number[]>();
                    for (const c of all) {
                        if (c.parentId !== null && c.parentId !== undefined) {
                            if (!childrenMap.has(c.parentId)) childrenMap.set(c.parentId, []);
                            childrenMap.get(c.parentId)!.push(c.id);
                        }
                    }
                    const toDelete = new Set<number>([id_num]);
                    const stack = [id_num];
                    while (stack.length) {
                        const cur = stack.pop()!;
                        for (const k of (childrenMap.get(cur) || [])) {
                            if (!toDelete.has(k)) { toDelete.add(k); stack.push(k); }
                        }
                    }
                    await db.delete(comments).where(inArray(comments.id, Array.from(toDelete)));
                    return 'OK';
                })
        );
}