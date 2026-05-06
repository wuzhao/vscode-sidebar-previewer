// Mermaid 图表渲染与交互模块
// 负责 Mermaid 图表的客户端渲染、SVG 自适应缩放、画布拖拽平移

(function() {

// Mermaid 拖拽平移过程中的全局状态
const MERMAID_DRAG_STATE = {
    container: null,
    dragging: false,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    panX: 0,
    panY: 0,
    effectiveScale: 1,
};

/**
 * 渲染 Mermaid
 * 渲染页面中的 Mermaid 图表节点
 */
function renderMermaid() {
    if (typeof mermaid === 'undefined') {
        const els = document.querySelectorAll('.mermaid');
        els.forEach(el => {
            el.innerHTML = '<div class="render-error-block">'
                + '<i class="codicon codicon-error"></i> Mermaid library failed to load'
                + '</div>';
        });
        return;
    }

    // 检测当前主题
    const isDark = document.body.classList.contains('vscode-dark') ||
                   document.body.classList.contains('vscode-high-contrast');

    mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        securityLevel: 'loose',
    });

    // 移除 data-processed 属性（允许重新渲染）
    const elements = document.querySelectorAll('.mermaid');
    elements.forEach(el => {
        if (!el.getAttribute('data-source')) {
            el.setAttribute('data-source', el.textContent);
        }
        el.removeAttribute('data-processed');
    });

    // 使用 mermaid.run() 进行就地渲染
    const renderPromise = Promise.race([
        mermaid.run({
            querySelector: '.mermaid',
            suppressErrors: false,
        }),
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Mermaid rendering timeout')), MERMAID_RENDER_TIMEOUT_MS);
        })
    ]);

    renderPromise.then(() => {
        if (currentFileType !== 'mermaid') {
            return;
        }
        elements.forEach(el => {
            const svg = el.querySelector('svg');
            if (svg) {
                svg.style.display = 'block';
                svg.style.maxWidth = 'none';
                clearMermaidSvgBaseSizeCache(svg);
                getMermaidSvgBaseSize(svg);
            }
        });
    }).catch(err => {
        const errorMessage = escapeHtml(getErrorMessage(err));
        elements.forEach(el => {
            if (!el.querySelector('svg')) {
                el.innerHTML = '<div class="render-error-block">'
                    + '<i class="codicon codicon-error"></i> '
                    + errorMessage
                    + '</div>';
            }
        });
    }).finally(() => {
        refreshMermaidZoomAfterRender();
    });
}

/**
 * 根据当前缩放级别调整 Mermaid 图表，使用 CSS transform 实现缩放与居中
 */
function applyMermaidZoom() {
    const content = document.getElementById('content');
    const container = content.querySelector('.mermaid-container');
    if (!container) {
        content.classList.remove('is-mermaid-preview');
        return;
    }

    bindMermaidPan(container);
    content.classList.add('is-mermaid-preview');

    const svg = container.querySelector('.mermaid svg');
    if (!svg) return;

    const baseSize = getMermaidSvgBaseSize(svg);
    if (!baseSize) return;

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    if (containerWidth <= 0 || containerHeight <= 0) return;

    // 计算让 SVG 适配容器的缩放比例，留 15% 边距
    const fitScale = Math.min(containerWidth / baseSize.width, containerHeight / baseSize.height) * 0.85;
    const mermaidZoomScale = getMermaidZoomScale();
    const effectiveScale = mermaidZoomScale * fitScale;

    svg.style.display = 'block';
    svg.style.maxWidth = 'none';
    svg.style.width = `${baseSize.width}px`;
    svg.style.height = `${baseSize.height}px`;

    // 重置平移偏移，让图表在每次缩放或内容更新后居中
    MERMAID_DRAG_STATE.panX = 0;
    MERMAID_DRAG_STATE.panY = 0;
    MERMAID_DRAG_STATE.effectiveScale = effectiveScale;

    applyMermaidTransform(container);
}

/**
 * 获取 Mermaid 当前缩放倍率
 * 统一叠加预览缩放与 Mermaid 专属倍率
 * @returns 返回 Mermaid 实际缩放倍率
 */
function getMermaidZoomScale() {
    return (zoomLevel / 100);
}

/**
 * 将当前的平移与缩放状态应用到 Mermaid 包裹层 transform
 * @param container - Mermaid 图表容器
 */
function applyMermaidTransform(container) {
    const mermaidEl = container.querySelector('.mermaid');
    if (!mermaidEl) return;

    const { panX, panY, effectiveScale } = MERMAID_DRAG_STATE;
    mermaidEl.style.transform = `translate(${panX}px, ${panY}px) scale(${effectiveScale})`;
}

/**
 * 清理 Mermaid SVG 基础尺寸缓存
 * 避免切换图表后复用旧尺寸导致缩放与字体比例异常
 * @param svg - Mermaid SVG 节点
 */
function clearMermaidSvgBaseSizeCache(svg) {
    delete svg.dataset.baseWidth;
    delete svg.dataset.baseHeight;
}

/**
 * 渲染结束后刷新 Mermaid 缩放
 * 通过双阶段刷新等待布局稳定后再应用缩放
 */
function refreshMermaidZoomAfterRender() {
    applyZoom();
    requestAnimationFrame(() => {
        applyZoom();
    });
}

/**
 * 获取 Mermaid SVG 的基础尺寸，用于后续缩放计算
 * @param svg - Mermaid SVG 节点
 * @returns 返回 Mermaid SVG 的基础宽高
 */
function getMermaidSvgBaseSize(svg) {
    const cachedWidth = parseFloat(svg.dataset.baseWidth || '');
    const cachedHeight = parseFloat(svg.dataset.baseHeight || '');
    if (cachedWidth > 0 && cachedHeight > 0) {
        return { width: cachedWidth, height: cachedHeight };
    }

    let width = 0;
    let height = 0;

    const viewBox = svg.viewBox && svg.viewBox.baseVal;
    if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
        width = viewBox.width;
        height = viewBox.height;
    }

    if (!(width > 0 && height > 0)) {
        const attrWidth = parseFloat(svg.getAttribute('width') || '');
        const attrHeight = parseFloat(svg.getAttribute('height') || '');
        if (attrWidth > 0 && attrHeight > 0) {
            width = attrWidth;
            height = attrHeight;
        }
    }

    if (!(width > 0 && height > 0)) {
        try {
            const box = svg.getBBox();
            if (box.width > 0 && box.height > 0) {
                width = box.width;
                height = box.height;
            }
        } catch (_error) {
            // 忽略 getBBox 异常，继续使用后续兜底尺寸来源
        }
    }

    if (!(width > 0 && height > 0)) {
        const rect = svg.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            width = rect.width;
            height = rect.height;
        }
    }

    if (!(width > 0 && height > 0)) {
        return null;
    }

    svg.dataset.baseWidth = String(width);
    svg.dataset.baseHeight = String(height);
    return { width, height };
}

/**
 * 绑定 Mermaid 画布的拖拽平移能力
 * @param container - Mermaid 图表容器
 */
function bindMermaidPan(container) {
    if (MERMAID_DRAG_STATE.container === container) {
        container.classList.add('is-pannable');
        return;
    }

    if (MERMAID_DRAG_STATE.container) {
        MERMAID_DRAG_STATE.container.removeEventListener('mousedown', onMermaidMouseDown);
        MERMAID_DRAG_STATE.container.classList.remove('is-dragging', 'is-pannable');
    }

    MERMAID_DRAG_STATE.container = container;
    container.addEventListener('mousedown', onMermaidMouseDown);
    container.classList.add('is-pannable');
}

/**
 * 解除 Mermaid 画布拖拽平移绑定并重置状态
 */
function teardownMermaidPan() {
    stopMermaidDragging();
    if (MERMAID_DRAG_STATE.container) {
        MERMAID_DRAG_STATE.container.removeEventListener('mousedown', onMermaidMouseDown);
        MERMAID_DRAG_STATE.container.classList.remove('is-dragging', 'is-pannable');
        MERMAID_DRAG_STATE.container = null;
    }
}

/**
 * 记录拖拽起点并进入 Mermaid 画布拖拽状态
 * @param e - 浏览器事件对象
 */
function onMermaidMouseDown(e) {
    if (e.button !== 0) {
        return;
    }
    if (e.target && e.target.closest && e.target.closest('.copy-btn')) {
        return;
    }
    if (!MERMAID_DRAG_STATE.container) {
        return;
    }

    MERMAID_DRAG_STATE.dragging = true;
    MERMAID_DRAG_STATE.startX = e.clientX;
    MERMAID_DRAG_STATE.startY = e.clientY;
    MERMAID_DRAG_STATE.startPanX = MERMAID_DRAG_STATE.panX;
    MERMAID_DRAG_STATE.startPanY = MERMAID_DRAG_STATE.panY;
    MERMAID_DRAG_STATE.container.classList.add('is-dragging');
    document.body.classList.add('mermaid-dragging');
    e.preventDefault();
}

/**
 * 根据鼠标位移更新 Mermaid 画布的平移偏移并刷新 transform
 * @param e - 浏览器事件对象
 */
function onMermaidMouseMove(e) {
    if (!MERMAID_DRAG_STATE.dragging || !MERMAID_DRAG_STATE.container) {
        return;
    }

    const deltaX = e.clientX - MERMAID_DRAG_STATE.startX;
    const deltaY = e.clientY - MERMAID_DRAG_STATE.startY;

    MERMAID_DRAG_STATE.panX = MERMAID_DRAG_STATE.startPanX + deltaX;
    MERMAID_DRAG_STATE.panY = MERMAID_DRAG_STATE.startPanY + deltaY;

    applyMermaidTransform(MERMAID_DRAG_STATE.container);
}

/**
 * 结束 Mermaid 画布拖拽并清理交互状态
 */
function stopMermaidDragging() {
    if (!MERMAID_DRAG_STATE.dragging) {
        return;
    }

    MERMAID_DRAG_STATE.dragging = false;
    if (MERMAID_DRAG_STATE.container) {
        MERMAID_DRAG_STATE.container.classList.remove('is-dragging');
    }
    document.body.classList.remove('mermaid-dragging');
}

// 在 window 上注册 Mermaid 画布拖拽相关事件监听
// 监听全局鼠标移动事件，驱动 Mermaid 画布拖拽平移
window.addEventListener('mousemove', onMermaidMouseMove);
// 监听全局鼠标释放事件，结束 Mermaid 画布拖拽
window.addEventListener('mouseup', stopMermaidDragging);
// 监听窗口失焦事件，安全终止 Mermaid 拖拽状态
window.addEventListener('blur', stopMermaidDragging);

// 暴露公共方法
window.PreviewMermaid = {
    renderMermaid: renderMermaid,
    applyMermaidZoom: applyMermaidZoom,
    teardownMermaidPan: teardownMermaidPan
};
})();
