// Markdown 预览交互模块
// 负责滚动定位到标题、可见标题报告回传、任务列表复选框状态同步和 Skeleton Outline

(function() {
// TOC 面板离开后恢复 Skeleton Outline 的延迟时间
const MARKDOWN_SKELETON_TOC_HIDE_DELAY_MS = 200;
// Skeleton Outline 横线的基础宽度
const MARKDOWN_SKELETON_LINE_BASE_WIDTH_PX = 2;
// Skeleton Outline 横线的最大宽度
const MARKDOWN_SKELETON_LINE_MAX_WIDTH_PX = 20;

let markdownOutlineHeadings = [];
let markdownOutlineScrollTarget = null;
let markdownOutlineScrollHandler = null;
let markdownOutlineHideTimer = null;

/**
 * 将预览滚动到指定锚点，缺省时回到顶部
 * @param headingId - 目标标题锚点 ID
 */
function scrollToHeading(headingId) {
    const content = document.getElementById('content');
    if (!headingId) {
        content.scrollTo({ top: 0, behavior: 'instant' });
        return;
    }

    const element = document.getElementById(headingId);
    if (element) {
        isScrollingFromEditor = true;
        // 仅在预览内容滚动区域内定位标题，避免末项带动 webview 外层滚动
        const targetScrollTop = content.scrollTop + element.getBoundingClientRect().top - content.getBoundingClientRect().top;
        const maxScrollTop = Math.max(0, content.scrollHeight - content.clientHeight);
        const clampedScrollTop = Math.min(maxScrollTop, Math.max(0, targetScrollTop));
        content.scrollTo({ top: clampedScrollTop, behavior: 'instant' });
        setTimeout(() => {
            isScrollingFromEditor = false;
        }, 300);
    }
}

/**
 * 报告当前预览中可见的标题
 * 计算当前可见锚点并回传给扩展端
 */
function reportVisibleHeading() {
    const content = document.getElementById('content');
    if (!content) {
        return;
    }

    const contentRect = content.getBoundingClientRect();
    let visibleHeadingId = null;

    // 顶部优先回传 frontmatter，保证「定位到顶部」可稳定落点
    const frontMatterTable = content.querySelector('#frontmatter');
    if (frontMatterTable instanceof HTMLElement) {
        const fmRect = frontMatterTable.getBoundingClientRect();
        const fmVisibleNearTop = fmRect.bottom >= contentRect.top + 10 && fmRect.top <= contentRect.top + 50;
        if (content.scrollTop <= 2 || fmVisibleNearTop) {
            visibleHeadingId = 'frontmatter';
        }
    }

    if (!visibleHeadingId) {
        const headings = content.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]');
        let visibleHeading = null;
        for (const heading of headings) {
            const rect = heading.getBoundingClientRect();
            if (rect.top <= contentRect.top + 50) {
                visibleHeading = heading;
            } else {
                break;
            }
        }
        visibleHeadingId = visibleHeading ? visibleHeading.id : null;
    }

    VSCODE_API.postMessage({
        type: 'visibleHeading',
        headingId: visibleHeadingId
    });
}

/**
 * 获取可用于 Skeleton Outline 的真实 Markdown 标题
 * @returns Markdown 标题元数据集合
 */
function getMarkdownOutlineHeadings() {
    return currentHeadings.filter(heading => {
        if (!heading || typeof heading.id !== 'string') {
            return false;
        }
        const element = document.getElementById(heading.id);
        return element instanceof HTMLElement && /^H[1-6]$/.test(element.tagName);
    });
}

/**
 * 根据当前文档标题层级构建相对层级索引
 * @param headings - Markdown 标题元数据集合
 * @returns 标题等级到相对层级的映射
 */
function buildMarkdownOutlineRankMap(headings) {
    const normalizedHeadingLevels = Array.from(new Set(headings.map(heading => heading.level))).sort((a, b) => a - b);
    const rankMap = new Map();
    normalizedHeadingLevels.forEach((level, index) => {
        rankMap.set(level, index);
    });
    return rankMap;
}

/**
 * 根据 Markdown 标题相对层级计算 Skeleton Outline 横线宽度
 * @param headingRank - 标题在当前文档实际层级中的相对位置
 * @param headingLevelCount - 当前文档包含的标题层级数量
 * @returns 横线宽度像素值
 */
function resolveMarkdownSkeletonLineWidth(headingRank, headingLevelCount) {
    const normalizedHeadingLevelCount = Math.max(1, headingLevelCount);
    const normalizedHeadingRank = Math.min(normalizedHeadingLevelCount - 1, Math.max(0, headingRank));
    const distributableWidth = MARKDOWN_SKELETON_LINE_MAX_WIDTH_PX - MARKDOWN_SKELETON_LINE_BASE_WIDTH_PX;
    const averageWidth = distributableWidth / normalizedHeadingLevelCount;
    const widthOffset = Math.floor(
        normalizedHeadingRank * averageWidth / MARKDOWN_SKELETON_LINE_BASE_WIDTH_PX
    ) * MARKDOWN_SKELETON_LINE_BASE_WIDTH_PX;
    return MARKDOWN_SKELETON_LINE_MAX_WIDTH_PX - widthOffset;
}

/**
 * 清理 TOC 延迟隐藏计时器
 */
function clearMarkdownSkeletonTocHideTimer() {
    if (!markdownOutlineHideTimer) {
        return;
    }
    clearTimeout(markdownOutlineHideTimer);
    markdownOutlineHideTimer = null;
}

/**
 * 显示 Markdown TOC 面板并隐藏 Skeleton Outline 横线
 */
function showMarkdownSkeletonToc() {
    clearMarkdownSkeletonTocHideTimer();
    const outline = document.querySelector('.markdown-skeleton-outline');
    if (outline) {
        outline.classList.add('is-toc-open');
    }
}

/**
 * 延迟隐藏 Markdown TOC 面板并恢复 Skeleton Outline 横线
 */
function scheduleMarkdownSkeletonTocHide() {
    clearMarkdownSkeletonTocHideTimer();
    markdownOutlineHideTimer = setTimeout(() => {
        markdownOutlineHideTimer = null;
        const outline = document.querySelector('.markdown-skeleton-outline');
        if (outline) {
            outline.classList.remove('is-toc-open');
        }
    }, MARKDOWN_SKELETON_TOC_HIDE_DELAY_MS);
}

/**
 * 根据滚动位置更新 Skeleton Outline 当前标题高亮
 */
function updateMarkdownSkeletonOutlineActiveItem() {
    const content = document.getElementById('content');
    const outline = document.querySelector('.markdown-skeleton-outline');
    if (!content || !outline || markdownOutlineHeadings.length === 0) {
        return;
    }

    const contentRect = content.getBoundingClientRect();
    let activeHeadingId = null;
    for (const heading of markdownOutlineHeadings) {
        const element = document.getElementById(heading.id);
        if (!(element instanceof HTMLElement)) {
            continue;
        }
        const rect = element.getBoundingClientRect();
        if (rect.top <= contentRect.top + 64) {
            activeHeadingId = heading.id;
        } else {
            break;
        }
    }

    if (!activeHeadingId) {
        activeHeadingId = markdownOutlineHeadings[0].id;
    }

    outline.querySelectorAll('.markdown-skeleton-line, .markdown-skeleton-toc-item').forEach(item => {
        item.classList.toggle('is-active', item.getAttribute('data-heading-id') === activeHeadingId);
    });
}

/**
 * 清理旧的 Skeleton Outline 和滚动监听
 */
function cleanupMarkdownSkeletonOutline() {
    clearMarkdownSkeletonTocHideTimer();
    const oldOutline = document.querySelector('.markdown-skeleton-outline');
    if (oldOutline) {
        oldOutline.remove();
    }
    if (markdownOutlineScrollTarget && markdownOutlineScrollHandler) {
        markdownOutlineScrollTarget.removeEventListener('scroll', markdownOutlineScrollHandler);
    }
    markdownOutlineScrollTarget = null;
    markdownOutlineScrollHandler = null;
    markdownOutlineHeadings = [];
}

/**
 * 构建 Skeleton Outline 的横线区域
 * @param headings - Markdown 标题元数据集合
 * @param rankMap - 标题等级到相对层级的映射
 * @returns 横线区域元素
 */
function buildMarkdownSkeletonLines(headings, rankMap) {
    const lines = document.createElement('div');
    lines.className = 'markdown-skeleton-lines';
    lines.addEventListener('mouseenter', showMarkdownSkeletonToc);

    headings.forEach(heading => {
        const rank = rankMap.get(heading.level) || 0;
        const line = document.createElement('button');
        line.type = 'button';
        line.className = 'markdown-skeleton-line';
        line.dataset.headingId = heading.id;
        line.dataset.headingRank = String(rank);
        line.style.width = `${resolveMarkdownSkeletonLineWidth(rank, rankMap.size)}px`;
        line.title = heading.text;
        line.addEventListener('click', () => {
            scrollToHeading(heading.id);
            requestAnimationFrame(updateMarkdownSkeletonOutlineActiveItem);
        });
        lines.appendChild(line);
    });

    return lines;
}

/**
 * 构建 Skeleton Outline hover 后展示的 TOC 面板
 * @param headings - Markdown 标题元数据集合
 * @param rankMap - 标题等级到相对层级的映射
 * @returns TOC 面板元素
 */
function buildMarkdownSkeletonToc(headings, rankMap) {
    const toc = document.createElement('div');
    toc.className = 'markdown-skeleton-toc';
    toc.setAttribute('role', 'navigation');
    toc.addEventListener('mouseenter', clearMarkdownSkeletonTocHideTimer);
    toc.addEventListener('mouseleave', scheduleMarkdownSkeletonTocHide);

    headings.forEach(heading => {
        const rank = rankMap.get(heading.level) || 0;
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'markdown-skeleton-toc-item';
        item.dataset.headingId = heading.id;
        item.style.marginLeft = `${rank * 20}px`;

        const content = document.createElement('span');
        content.className = 'markdown-skeleton-toc-item-content';

        const levelLabel = document.createElement('span');
        levelLabel.className = 'markdown-skeleton-toc-level';
        levelLabel.textContent = `H${heading.level}`;

        const title = document.createElement('span');
        title.className = 'markdown-skeleton-toc-title';
        title.textContent = heading.text;

        content.appendChild(levelLabel);
        content.appendChild(title);
        item.appendChild(content);
        item.addEventListener('click', () => {
            scrollToHeading(heading.id);
            requestAnimationFrame(updateMarkdownSkeletonOutlineActiveItem);
        });
        toc.appendChild(item);
    });

    return toc;
}

/**
 * 初始化 Markdown Skeleton Outline
 */
function initMarkdownSkeletonOutline() {
    cleanupMarkdownSkeletonOutline();
    const content = document.getElementById('content');
    if (!content) {
        return;
    }

    markdownOutlineHeadings = getMarkdownOutlineHeadings();
    if (markdownOutlineHeadings.length === 0) {
        return;
    }

    const rankMap = buildMarkdownOutlineRankMap(markdownOutlineHeadings);
    const outline = document.createElement('div');
    outline.className = 'markdown-skeleton-outline';
    outline.appendChild(buildMarkdownSkeletonLines(markdownOutlineHeadings, rankMap));
    outline.appendChild(buildMarkdownSkeletonToc(markdownOutlineHeadings, rankMap));
    const outlineHost = document.getElementById('sidebar-previewer-container') || content;
    outlineHost.appendChild(outline);

    markdownOutlineScrollTarget = content;
    markdownOutlineScrollHandler = updateMarkdownSkeletonOutlineActiveItem;
    content.addEventListener('scroll', markdownOutlineScrollHandler, { passive: true });
    updateMarkdownSkeletonOutlineActiveItem();
}

/**
 * 绑定任务列表复选框事件
 * 绑定任务列表复选框变更事件，并同步回编辑器
 */
function bindCheckboxEvents() {
    const checkboxes = document.querySelectorAll('li.task-list-item input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.addEventListener('change', (e) => {
            const line = parseInt(e.target.getAttribute('data-line'), 10);
            if (!isNaN(line) && line >= 0) {
                VSCODE_API.postMessage({
                    type: 'toggleCheckbox',
                    line: line,
                    checked: e.target.checked
                });
            }
        });
    });
}

    // 向公共注册中心登记：仅在 Markdown 文件类型时激活
    PreviewCommon.registerDomainInit(['markdown'], 'markdown', function() {
        bindCheckboxEvents();
        initMarkdownSkeletonOutline();
    });

    // 暴露公共方法
    window.PreviewMarkdown = {
        scrollToHeading: scrollToHeading,
        reportVisibleHeading: reportVisibleHeading,
        bindCheckboxEvents: bindCheckboxEvents,
        cleanupMarkdownSkeletonOutline: cleanupMarkdownSkeletonOutline,
        initMarkdownSkeletonOutline: initMarkdownSkeletonOutline,
        updateMarkdownSkeletonOutlineActiveItem: updateMarkdownSkeletonOutlineActiveItem
    };
})();
