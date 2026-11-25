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
            let cleaned = tex.trim();
            if (cleaned.startsWith('$$') && cleaned.endsWith('$$') && cleaned.length >= 4) {
                cleaned = cleaned.slice(2, -2).trim();
            }
            // 只转换 KaTeX 缺少的外层环境，保留矩阵、分段函数与对齐点
            cleaned = cleaned.replace(/^\\begin\{(displaymath|math|multline\*?)\}([\s\S]*)\\end\{\1\}$/,
                (_, environment, body) => environment.startsWith('multline')
                    ? `\\begin{gathered}${body}\\end{gathered}` : body);
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
