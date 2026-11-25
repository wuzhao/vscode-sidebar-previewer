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

/**
 * 为文档标题分配唯一锚点并记录后续可用的十六进制后缀
 * @param text - 源文档中的标题文字
 * @param usedIds - 当前文档已占用的锚点和后缀计数
 * @returns 标题及目录定位共用的 HTML 标识
 */
export function generateHeadingId(text: string, usedIds: Map<string, number>): string {
    const slug = text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '') || 'heading';
    let next = usedIds.get(slug) ?? 1;
    let id = slug;
    while (usedIds.has(id)) {
        id = `${slug}-${next.toString(16)}`;
        next++;
    }
    usedIds.set(slug, next);
    usedIds.set(id, 1);
    return id;
}
