// 转义文本中的 HTML 特殊字符，避免预览内容破坏 DOM 结构
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// 转义文本中的正则特殊字符，用于按字面量构造匹配表达式
export function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
