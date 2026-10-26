import React from "react";
import { editor, Range } from "monaco-editor";

type Tool = { icon?: string; text?: string; label: string; action: () => void };

/**
 * Monaco Markdown 格式化工具栏：通过 editorRef 在选区上插入 / 包裹 Markdown，
 * 或给整行加前缀（标题 / 列表 / 引用）。纯前端，不引入新依赖。
 */
export function EditorToolbar({ editorRef }: { editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | undefined> }) {
    function wrap(before: string, after = before, placeholder = "文本") {
        const ed = editorRef.current;
        if (!ed) return;
        const sel = ed.getSelection();
        const model = ed.getModel();
        if (!sel || !model) return;
        const selected = model.getValueInRange(sel);
        const text = selected || placeholder;
        ed.executeEdits("toolbar", [{ range: sel, text: before + text + after }]);
        // 未选中文本时，把光标落在占位符上方便继续输入
        if (!selected) {
            const pos = ed.getSelection();
            if (pos) {
                const endCol = pos.startColumn - after.length;
                const startCol = Math.max(1, endCol - placeholder.length);
                ed.setSelection({
                    startLineNumber: pos.startLineNumber,
                    startColumn: startCol,
                    endLineNumber: pos.startLineNumber,
                    endColumn: endCol,
                });
            }
        }
        ed.focus();
    }

    function toggleLinePrefix(prefix: string) {
        const ed = editorRef.current;
        if (!ed) return;
        const sel = ed.getSelection();
        const model = ed.getModel();
        if (!sel || !model) return;
        const edits: { range: Range; text: string }[] = [];
        for (let l = sel.startLineNumber; l <= sel.endLineNumber; l++) {
            if (!model.getLineContent(l).startsWith(prefix)) {
                edits.push({ range: new Range(l, 1, l, 1), text: prefix });
            }
        }
        if (edits.length) ed.executeEdits("toolbar", edits);
        ed.focus();
    }

    const tools: Tool[] = [
        { icon: "ri-bold", label: "加粗", action: () => wrap("**", "**", "加粗文字") },
        { icon: "ri-italic", label: "斜体", action: () => wrap("*", "*", "斜体文字") },
        { text: "H1", label: "一级标题", action: () => toggleLinePrefix("# ") },
        { text: "H2", label: "二级标题", action: () => toggleLinePrefix("## ") },
        { text: "H3", label: "三级标题", action: () => toggleLinePrefix("### ") },
        { icon: "ri-link", label: "链接", action: () => wrap("[", "](https://)", "链接文字") },
        { icon: "ri-image-line", label: "图片", action: () => wrap("![", "](https://)", "图片描述") },
        { icon: "ri-code-line", label: "行内代码", action: () => wrap("`", "`", "code") },
        { icon: "ri-code-box-line", label: "代码块", action: () => wrap("```\n", "\n```", "代码") },
        { icon: "ri-double-quotes-l", label: "引用", action: () => toggleLinePrefix("> ") },
        { icon: "ri-list-unordered", label: "无序列表", action: () => toggleLinePrefix("- ") },
        { icon: "ri-list-ordered", label: "有序列表", action: () => toggleLinePrefix("1. ") },
    ];

    return (
        <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-neutral-200 dark:border-neutral-700">
            {tools.map((tool) => (
                <button
                    key={tool.label}
                    title={tool.label}
                    aria-label={tool.label}
                    onClick={tool.action}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-600 dark:text-neutral-300 hover:text-theme hover:bg-secondary active:scale-95 transition duration-150">
                    {tool.text
                        ? <span className="text-xs font-semibold">{tool.text}</span>
                        : <i className={tool.icon} />}
                </button>
            ))}
        </div>
    );
}
