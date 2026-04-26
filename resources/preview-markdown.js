// Markdown 预览交互模块
// 负责滚动定位到标题、可见标题报告回传、任务列表复选框状态同步

(function() {
/**
 * 将预览滚动到指定锚点，缺省时回到顶部
 * @param headingId - 目标标题锚点 ID
 */
function scrollToHeading(headingId) {
    if (!headingId) {
        document.getElementById('content').scrollTop = 0;
        return;
    }

    const element = document.getElementById(headingId);
    if (element) {
        isScrollingFromEditor = true;
        element.scrollIntoView({ behavior: 'instant', block: 'start' });
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

    // 顶部优先回传 frontmatter-table，保证「定位到顶部」可稳定落点
    const frontMatterTable = content.querySelector('#frontmatter-table');
    if (frontMatterTable instanceof HTMLElement) {
        const fmRect = frontMatterTable.getBoundingClientRect();
        const fmVisibleNearTop = fmRect.bottom >= contentRect.top + 10 && fmRect.top <= contentRect.top + 50;
        if (content.scrollTop <= 2 || fmVisibleNearTop) {
            visibleHeadingId = 'frontmatter-table';
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
    });

    // 暴露公共方法
    window.PreviewMarkdown = {
        scrollToHeading: scrollToHeading,
        reportVisibleHeading: reportVisibleHeading,
        bindCheckboxEvents: bindCheckboxEvents
    };
})();
