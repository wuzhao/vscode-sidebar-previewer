# 项目架构概览

**Sidebar Previewer** 是一个 VS Code 侧边栏扩展，能在侧边栏 Webview 面板中实时预览当前活动编辑器的文件内容。支持九种文件格式：Markdown、LaTeX、Mermaid、JSON、YAML、TOML、XML、CSV、TSV。

核心设计思路是：**TypeScript 宿主进程（Extension Host）负责解析和状态管理，Webview 负责渲染和交互**，两者通过 `postMessage` 协议通信。文件格式通过独立的 Provider 类分别处理，统一由 `PreviewProvider` 协调调度。

---

## 架构图

```plaintext
┌───────────────────────────────────────────────────────────────────────┐
│                          VS Code Extension Host                       │
│   extension.ts                                                        │
│   ┌───────────────────────────────────────────────────────────────┐   │
│   │  activate()                                                   │   │
│   │  · 初始化 i18n                                                │   │
│   │  · 注册 WebviewViewProvider                                   │   │
│   │  · 注册所有命令（zoomIn/Out/Reset, locate, follow...）        │   │
│   └─────────────────────┬─────────────────────────────────────────┘   │
│                         │ new PreviewProvider(context)                │
│                         ▼                                             │
│   previewProvider.ts                                                  │
│   ┌───────────────────────────────────────────────────────────────┐   │
│   │  PreviewProvider (WebviewViewProvider)                        │   │
│   │  · 监听编辑器切换 / 文档变更 / 可视区域滚动                   │   │
│   │  · 识别文件类型（fileTypes.ts）                               │   │
│   │  · 调用对应 Format Provider 解析内容                          │   │
│   │  · 构建 Webview HTML（注入 CSS/JS 资源）                      │   │
│   │  · 与 Webview 双向 postMessage 通信                           │   │
│   │  · 暴露命令接口（zoom / locate / follow / expand...）         │   │
│   └─────────────────────┬─────────────────────────────────────────┘   │
│                         │ parse(content, fileType)                    │
│                         ▼                                             │
│   ┌───────────────────────────────────────────────────────────────┐   │
│   │                   Format Providers（解析层）                  │   │
│   │                                                               │   │
│   │  markdownPreviewProvider.ts → Markdown + front matter         │   │
│   │  latexPreviewProvider.ts    → LaTeX → HTML + KaTeX 占位       │   │
│   │  datatreePreviewProvider.ts → JSON/YAML/TOML/XML → 树形 HTML  │   │
│   │  mermaidPreviewProvider.ts  → Mermaid → 原始代码块            │   │
│   │  tablePreviewProvider.ts    → CSV/TSV → HTML 表格             │   │
│   │                                                               │   │
│   │  返回: { html, fileType, supportsLocate, headings? }          │   │
│   └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
│   fileTypes.ts   — 文件扩展名 → FileType 映射 + 能力描述              │
│   i18n.ts        — 多语言字符串（en/zh-CN/zh-TW/zh-HK/ja-JP）         │
└─────────────────────────┬─────────────────────────────────────────────┘
                          │ postMessage / onDidReceiveMessage
                          ▼
┌───────────────────────────────────────────────────────────────────────┐
│                         Webview（浏览器环境）                         │
│                                                                       │
│   resources/js/*.js                                                   │
│   ┌───────────────────────────────────────────────────────────────┐   │
│   │  · 接收 update 消息，将 HTML 注入 DOM                         │   │
│   │  · 触发 KaTeX 渲染（数学公式）                                │   │
│   │  · 触发 Mermaid 渲染（图表）                                  │   │
│   │  · 处理缩放（滚轮 + 命令）                                    │   │
│   │  · 处理编辑器 ↔ 预览双向定位/滚动同步                         │   │
│   │  · 代码块复制按钮交互                                         │   │
│   │  · Mermaid 图表拖拽平移                                       │   │
│   └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
│   resources/css/*.css  — 按模块拆分的预览样式（含 common.css）        │
│   resources/vendor/                                                   │
│   ├── katex/             — 数学公式渲染库                             │
│   ├── mermaid/           — 图表渲染库                                 │
│   └── codicons/          — VS Code 图标字体                           │
└───────────────────────────────────────────────────────────────────────┘

消息协议（Extension Host ↔ Webview）：
Host → Webview : update | loading | scrollToHeading | scrollToLine |
                 getVisibleHeading | getVisibleLine | zoom |
                 expandAll | collapseAll |
                 highlightDataTreeRange | highlightTableRange
Webview → Host : webviewReady | zoomChange | visibleHeading | visibleLine |
                 toggleCheckbox | navigateToLine | updateEditorSelection
```

---

## 数据流说明

1. **文件打开/切换**：VS Code 触发 `onDidChangeActiveTextEditor`，`PreviewProvider` 读取文档内容并识别文件类型。
2. **解析**：调用对应 Format Provider 的静态 `parse()` 方法，返回包含渲染好的 HTML 字符串及元数据的 `PreviewResult`。
3. **渲染**：将 HTML 通过 `postMessage({ type: 'update', ... })` 发送至 Webview；Webview 注入 DOM 后执行二次渲染（KaTeX、Mermaid）。
4. **定位同步**：编辑器滚动时，Host 计算可视区域对应的标题/节点，发送 `scrollToHeading` 消息；Webview 点击标题时，向 Host 发送 `locateEditor` 消息反向跳转。
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
| 点击 data-tree key 本地高亮并跳转编辑器（`highlightTreeRange` + `navigateToLine`） | `resources/js/datatree.js` |
| CSV/TSV 多单元格复制快捷操作（Markdown/ASCII） | `resources/js/table.js` |
| comment popup 展示与交互锁 | `resources/js/comment-tooltip.js` |
| datatree 展开与折叠（`expandAllNodes` / `collapseAllNodes`） | `resources/js/datatree.js` |
| datatree 展开/折叠命令分发（Host -> Webview） | `src/previewProvider.ts` |

### 关键调用关系

1. `resources/js/datatree.js` 的 `bindTreeKeyClicks()` 读取 `data-line`，先执行本地 `highlightTreeRange(line, line)`，再发送 `navigateToLine` 消息
2. `src/previewProvider.ts` 接收消息后执行编辑器定位与高亮联动
3. `resources/js/comment-tooltip.js` 负责注释 icon 的浮层渲染与交互守卫
4. `src/previewProvider.ts` 触发 `expandAll` / `collapseAll` 消息，由 `resources/js/datatree.js` 执行节点开合
