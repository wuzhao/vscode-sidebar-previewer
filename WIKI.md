# 项目架构概览

**Sidebar Previewer** 是一个 VS Code 侧边栏扩展，能在侧边栏 Webview 面板中实时预览当前活动编辑器的文件内容。支持十种文件格式：Markdown、LaTeX、Mermaid、JSON、JSONL、YAML、TOML、XML、CSV、TSV。

核心设计思路是：**TypeScript 宿主进程（Extension Host）负责解析、状态管理和编辑器联动，Webview 负责 DOM 渲染、二次渲染和交互**，两者通过 `postMessage` 协议通信。文件格式通过独立的 Provider 类分别处理，统一由 `PreviewProvider` 协调调度。

---

## 架构图

```plaintext
┌─────────────────────────────────────────────────────────────────────────────┐
│                          VS Code Extension Host                             │
│   extension.ts                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  activate()                                                         │   │
│   │  · 初始化 i18n                                                      │   │
│   │  · 注册 WebviewViewProvider                                         │   │
│   │  · 注册所有命令（zoomIn/Out/Reset, locate, follow...）              │   │
│   └─────────────────────┬───────────────────────────────────────────────┘   │
│                         │ new PreviewProvider(context)                      │
│                         │                                                   │
│   previewProvider.ts    │                                                   │
│   ┌─────────────────────▼───────────────────────────────────────────────┐   │
│   │  PreviewProvider (WebviewViewProvider)                              │   │
│   │  · 监听编辑器切换 / 文档变更 / 可视区域滚动                         │   │
│   │  · 识别文件类型（fileTypes.ts）                                     │   │
│   │  · 调用对应 Format Provider 解析内容                                │   │
│   │  · 构建 Webview HTML（注入 CSS/JS 资源）                            │   │
│   │  · 与 Webview 双向 postMessage 通信                                 │   │
│   │  · 暴露命令接口（zoom / locate / follow / expand...）               │   │
│   └─────────────────────┬───────────────────────────────────────────────┘   │
│                         │ parse(content, fileType)                          │
│                         │                                                   │
│   ┌─────────────────────▼───────────────────────────────────────────────┐   │
│   │                   Format Providers（解析层）                        │   │
│   │                                                                     │   │
│   │  markdownPreviewProvider.ts → Markdown + front matter               │   │
│   │  latexPreviewProvider.ts    → LaTeX → HTML + KaTeX 占位             │   │
│   │  datatreePreviewProvider.ts → JSON/JSONL/YAML/TOML/XML → 树形 HTML  │   │
│   │  mermaidPreviewProvider.ts  → Mermaid → 原始代码块                  │   │
│   │  tablePreviewProvider.ts    → CSV/TSV → HTML 表格                   │   │
│   │                                                                     │   │
│   │  返回: { html, fileType, supportsLocate, headings? }                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   fileTypes.ts   — 文件扩展名 → FileType 映射 + 能力描述                    │
│   i18n.ts        — 多语言字符串（en/zh-CN/zh-TW/zh-HK/ja-JP）               │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │ postMessage / onDidReceiveMessage
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                         Webview（浏览器环境）                               │
│                                                                             │
│   resources/js/*.js                                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  · 接收 update 消息，将 HTML 注入 DOM                               │   │
│   │  · 触发 KaTeX 渲染（数学公式）                                      │   │
│   │  · 触发 Mermaid 渲染（图表）                                        │   │
│   │  · 处理缩放（滚轮 + 命令）                                          │   │
│   │  · 处理编辑器 ↔ 预览的滚动、选区和高亮联动                          │   │
│   │  · 代码块复制与折行按钮交互                                         │   │
│   │  · Mermaid 图表拖拽平移                                             │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   resources/css/*.css  — 按模块拆分的预览样式（含 common.css）              │
│   resources/vendor/                                                         │
│   ├── katex/             — 数学公式渲染库                                   │
│   ├── mermaid/           — 图表渲染库                                       │
│   └── codicons/          — VS Code 图标字体                                 │
└─────────────────────────────────────────────────────────────────────────────┘

消息协议（Extension Host ↔ Webview）：
Host → Webview : update | loading | scrollToHeading | scrollToLine |
                 getVisibleHeading | getVisibleLine | zoom |
                 expandAll | collapseAll | getHighlightedDataTreeLocator |
                 highlightDataTreeRange | highlightTableRange
Webview → Host : webviewReady | zoomChange | visibleHeading | visibleLine |
                 toggleCheckbox | navigateToLine | updateEditorSelection |
                 dataTreeHighlightState | dataTreeLocator
```

---

## 数据流说明

1. **文件打开/切换**：VS Code 触发 `onDidChangeActiveTextEditor`，`PreviewProvider` 读取文档内容并识别文件类型。
2. **解析**：调用对应 Format Provider 的静态 `parse()` 方法，返回包含渲染好的 HTML 字符串及元数据的 `PreviewResult`。
3. **渲染**：将 HTML 通过 `postMessage({ type: 'update', ... })` 发送至 Webview；Webview 注入 DOM 后执行二次渲染（KaTeX、Mermaid）。
4. **定位与高亮联动**：Markdown/LaTeX 通过标题信息做 `scrollToHeading` / `visibleHeading` 双向定位；CSV/TSV 通过 `scrollToLine` / `visibleLine` 和 `updateEditorSelection` 做行列联动；JSON/JSONL/YAML/TOML/XML 不启用通用 locate 命令，改由编辑器选区触发 `highlightDataTreeRange`，点击树节点时发送 `navigateToLine` 跳回源文件。
5. **命令**：用户点击工具栏按钮，VS Code 命令触发 `PreviewProvider` 公开方法（如 `zoomIn()`），再通过 `postMessage` 通知 Webview 更新 UI 状态。

---

### 后端解析层文件映射

| 职责 | 文件 |
| --- | --- |
| Datatree 入口与总调度 | `src/datatreePreviewProvider.ts` |
| 通用能力（定位与注释绑定） | `src/datatree/common/datatreeLocatorAndCommentBase.ts` |
| 通用能力（树渲染与边界处理） | `src/datatree/common/datatreeTreeRenderBase.ts` |
| JSON 相关实现 | `src/datatree/fileTypes/datatreeJsonFileTypeBase.ts` |
| YAML 相关实现 | `src/datatree/fileTypes/datatreeYamlFileTypeBase.ts` |
| TOML 相关实现 | `src/datatree/fileTypes/datatreeTomlFileTypeBase.ts` |
| XML 相关实现 | `src/datatree/fileTypes/datatreeXmlFileTypeBase.ts` |
| Datatree 共享类型定义 | `src/datatree/core/datatreeProviderTypes.ts` |

### 前端交互职责映射

| 交互能力 | 主要文件 |
| --- | --- |
| Host / Webview 消息分发、内容注入、缩放和按类型初始化 | `resources/js/common.js` |
| Markdown 任务列表回写、Skeleton Outline 与标题定位 | `resources/js/markdown.js` |
| 点击 data-tree key 跳转编辑器（`navigateToLine`），并根据编辑器选区高亮树节点（`highlightTreeRange`） | `resources/js/datatree.js` |
| 读取 data-tree 当前高亮节点并回传定位路径和高亮状态（`dataTreeLocator` / `dataTreeHighlightState`） | `resources/js/datatree.js` |
| Markdown 表格复制及 CSV/TSV 单元格选择、编辑器选区同步、Markdown/ASCII/TSV/CSV 多格式复制 | `resources/js/table.js` |
| 代码块复制反馈及 Markdown 代码块 Word Wrap 状态切换 | `resources/js/codeblock.js` |
| comment popup 展示与交互锁 | `resources/js/comment-tooltip.js` |
| datatree 展开与折叠（`expandAllNodes` / `collapseAllNodes`） | `resources/js/datatree.js` |
| datatree 展开/折叠命令分发（Host -> Webview） | `src/previewProvider.ts` |
| datatree 定位路径复制命令处理与剪贴板写入 | `src/previewProvider.ts` |

### 关键调用关系

1. `resources/js/datatree.js` 的 `bindTreeKeyClicks()` 读取 `data-line`，发送 `navigateToLine` 消息请求编辑器跳转
2. `src/previewProvider.ts` 接收 `navigateToLine` 后更新编辑器光标；编辑器选区变化再回传 `highlightDataTreeRange`，由 `resources/js/datatree.js` 计算唯一高亮节点
3. `resources/js/comment-tooltip.js` 负责注释 icon 的浮层渲染与交互守卫
4. `src/previewProvider.ts` 触发 `expandAll` / `collapseAll` 消息，由 `resources/js/datatree.js` 执行节点开合
