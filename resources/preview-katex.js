// KaTeX 客户端渲染模块
// 负责渲染页面中的 KaTeX 数学公式占位节点（块级公式与行内公式）

(function() {
/**
 * 渲染 KaTeX
 * 渲染页面中的 KaTeX 占位节点
 */
function renderKatex() {
    if (typeof katex === 'undefined') {
        return;
    }

    // 渲染块级公式
    const blocks = document.querySelectorAll('.katex-block');
    blocks.forEach(block => {
        if (!block.getAttribute('data-source')) {
            block.setAttribute('data-source', block.textContent);
        }
        try {
            const tex = block.getAttribute('data-source') || '';
            const cleaned = tex
                .replace(/^\$\$|\$\$$/g, '')
                .replace(/\\begin\{[^}]+\}/g, '')
                .replace(/\\end\{[^}]+\}/g, '')
                .trim();
            if (cleaned) {
                katex.render(cleaned, block, { displayMode: true, throwOnError: true });
            }
        } catch (e) {
            block.innerHTML = '<span class="render-error-inline">' + escapeHtml(getErrorMessage(e)) + '</span>';
        }
    });

    // 渲染行内公式
    const inlines = document.querySelectorAll('.katex-inline');
    inlines.forEach(span => {
        if (!span.getAttribute('data-source')) {
            span.setAttribute('data-source', span.textContent);
        }
        try {
            const tex = (span.getAttribute('data-source') || '').replace(/^\$|\$$/g, '').trim();
            if (tex) {
                katex.render(tex, span, { displayMode: false, throwOnError: true });
            }
        } catch (e) {
            span.innerHTML = '<span class="render-error-inline">' + escapeHtml(getErrorMessage(e)) + '</span>';
        }
    });
}

    // 暴露公共方法供 updateContent 内的特殊渲染路径调用
    window.PreviewKatex = {
        renderKatex: renderKatex
    };
})();
