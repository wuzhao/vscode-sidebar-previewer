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
        // 避免重复添加
        if (pre.querySelector('.copy-btn')) {
            return;
        }
        addCopyButton(pre);
    });
}

/**
 * 处理复制按钮相关逻辑并返回结果
 * @param pre - 目标代码块容器
 */
function addCopyButton(pre) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.title = L10N_TEXT.copyCode;
    copyBtn.innerHTML = '<i class="codicon codicon-copy"></i>';

    let resetTimer = null;

    /**
     * 将代码块复制按钮还原到默认状态
     */
    function resetCopyButtonState() {
        copyBtn.classList.remove('copied', 'copy-failed');
        copyBtn.innerHTML = '<i class="codicon codicon-copy"></i>';
    }

    /**
     * 按固定时长调度复制反馈复原
     */
    function scheduleCopyButtonReset() {
        if (resetTimer) {
            clearTimeout(resetTimer);
        }
        resetTimer = setTimeout(() => {
            resetCopyButtonState();
            resetTimer = null;
        }, CODE_BLOCK_COPY_RESET_MS);
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
            copyBtn.innerHTML = '<i class="codicon codicon-pass-filled"></i>' + L10N_TEXT.copySuccess;
            scheduleCopyButtonReset();
        } catch (err) {
            console.error('Copy failed:', err);
            copyBtn.classList.add('copy-failed');
            copyBtn.textContent = 'FAILED';
            scheduleCopyButtonReset();
        }
    });

    pre.appendChild(copyBtn);
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
