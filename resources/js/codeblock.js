// 代码块复制按钮模块
// 为所有 <pre> 代码块动态添加复制按钮，支持 clipboard API 写入剪贴板

(function() {
// 代码块复制反馈复原时长（毫秒）
const CODE_BLOCK_COPY_RESET_MS = 800;

/**
 * 代码块复制按钮
 * 处理代码块按钮相关逻辑并返回结果
 */
function addCodeBlockButtons() {
    const preBlocks = document.querySelectorAll('pre');
    preBlocks.forEach(pre => {
        const wrapper = ensureCodeBlockWrapper(pre);
        // 避免重复添加
        if (wrapper.querySelector('.copy-btn')) {
            return;
        }
        addCopyButton(pre, wrapper);
    });
}

/**
 * 确保代码块拥有用于固定按钮的容器
 * @param pre - 目标代码块容器
 * @returns 返回承载复制按钮的固定定位容器
 */
function ensureCodeBlockWrapper(pre) {
    const parent = pre.parentElement;
    if (parent && parent.classList.contains('code-block-wrapper')) {
        return parent;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';
    if (parent) {
        parent.insertBefore(wrapper, pre);
    }
    wrapper.appendChild(pre);
    return wrapper;
}

/**
 * 处理复制按钮相关逻辑并返回结果
 * @param pre - 目标代码块容器
 * @param wrapper - 承载复制按钮的固定定位容器
 */
function addCopyButton(pre, wrapper) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.title = L10N_TEXT.copyCode;
    copyBtn.innerHTML = '<i class="codicon codicon-copy"></i>';

    let resetTimer = null;

    /**
     * 清理复制反馈复原定时器
     */
    function clearCopyButtonResetTimer() {
        if (resetTimer) {
            clearTimeout(resetTimer);
            resetTimer = null;
        }
    }

    /**
     * 判断复制反馈是否处于可见状态
     * @returns 返回复制反馈可见状态
     */
    function isCopyFeedbackActive() {
        return copyBtn.classList.contains('copied') || copyBtn.classList.contains('copy-failed');
    }

    /**
     * 将代码块复制按钮还原到默认状态
     */
    function resetCopyButtonState() {
        clearCopyButtonResetTimer();
        copyBtn.classList.remove('copied', 'copy-failed');
        copyBtn.innerHTML = '<i class="codicon codicon-copy"></i>';
    }

    /**
     * 按固定时长调度复制反馈复原
     */
    function scheduleCopyButtonReset() {
        clearCopyButtonResetTimer();
        resetTimer = setTimeout(() => {
            resetCopyButtonState();
        }, CODE_BLOCK_COPY_RESET_MS);
    }

    /**
     * 根据鼠标悬停状态控制复制反馈复原时机
     * @param isHovering - 鼠标是否悬停在复制提示区域
     */
    function updateCopyButtonHoverState(isHovering) {
        if (!isCopyFeedbackActive()) {
            return;
        }

        if (isHovering) {
            clearCopyButtonResetTimer();
            return;
        }

        scheduleCopyButtonReset();
    }

    copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (copyBtn.classList.contains('copied') || copyBtn.classList.contains('copy-failed')) {
            return;
        }
        const code = pre.querySelector('code');
        // 如果有 data-source (mermaid 渲染后)，优先使用
        const text = pre.getAttribute('data-source') || (code ? code.textContent : pre.textContent);

        try {
            await navigator.clipboard.writeText(text);
            copyBtn.classList.add('copied');
            copyBtn.innerHTML = '<i class="codicon codicon-notebook-state-success"></i>';
            updateCopyButtonHoverState(copyBtn.matches(':hover'));
        } catch (err) {
            console.error('Copy failed:', err);
            copyBtn.classList.add('copy-failed');
            copyBtn.textContent = 'FAILED';
            updateCopyButtonHoverState(copyBtn.matches(':hover'));
        }
    });

    copyBtn.addEventListener('mouseenter', () => {
        updateCopyButtonHoverState(true);
    });

    copyBtn.addEventListener('mouseleave', () => {
        updateCopyButtonHoverState(false);
    });

    wrapper.appendChild(copyBtn);
}

    // 向公共注册中心登记：始终激活（适用于所有文件类型）
    PreviewCommon.registerDomainInit(null, 'codeblock', function() {
        addCodeBlockButtons();
    });

    // 暴露公共方法
    window.PreviewCodeblock = {
        addCodeBlockButtons: addCodeBlockButtons
    };
})();
