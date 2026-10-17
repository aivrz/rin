// 将扁平评论列表构建为层级树（按 parentId 归并），供弹窗与文章页共用
export type FlatComment = {
    id: number;
    content: string;
    createdAt: Date | string;
    parentId: number | null;
    user: { id: number; username: string; avatar: string | null; permission?: number | null };
};

export type CommentNode = FlatComment & { replies: CommentNode[] };

export function buildCommentTree(flat: FlatComment[]): CommentNode[] {
    const map = new Map<number, CommentNode>();
    for (const c of flat) {
        map.set(c.id, { ...c, replies: [] });
    }
    const roots: CommentNode[] = [];
    for (const node of map.values()) {
        if (node.parentId !== null && node.parentId !== undefined && map.has(node.parentId)) {
            map.get(node.parentId)!.replies.push(node);
        } else {
            roots.push(node);
        }
    }
    // 顶层按时间倒序（与后端 GET desc 一致），回复按时间正序，便于阅读
    const byTimeDesc = (a: CommentNode, b: CommentNode) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    const byTimeAsc = (a: CommentNode, b: CommentNode) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    roots.sort(byTimeDesc);
    const sortReplies = (nodes: CommentNode[]) => {
        nodes.sort(byTimeAsc);
        nodes.forEach((n) => sortReplies(n.replies));
    };
    sortReplies(roots);
    return roots;
}
