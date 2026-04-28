# 项目架构概览

**Sidebar Previewer** 是一个 VS Code 侧边栏扩展，能在侧边栏 Webview 面板中实时预览当前活动编辑器的文件内容。支持九种文件格式：Markdown、LaTeX、Mermaid、JSON、YAML、TOML、XML、CSV、TSV。

核心设计思路是：**TypeScript 宿主进程（Extension Host）负责解析和状态管理，Webview 负责渲染和交互**，两者通过 `postMessage` 协议通信。文件格式通过独立的 Provider 类分别处理，统一由 `PreviewProvider` 协调调度。

---

## 架构图

```plaintext
┌──────────────────────────────────────────────────────────────────────┐
│                          VS Code Extension Host                      │
│   extension.ts                                                       │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │  activate()                                                  │   │
│   │  · 初始化 i18n                                               │   │
│   │  · 注册 WebviewViewProvider                                  │   │
│   │  · 注册所有命令（zoomIn/Out/Reset, locate, follow...）       │   │
│   └─────────────────────┬────────────────────────────────────────┘   │
│                         │ new PreviewProvider(context)               │
│                         ▼                                            │
│   previewProvider.ts                                                 │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │  PreviewProvider (WebviewViewProvider)                       │   │
│   │  · 监听编辑器切换 / 文档变更 / 可视区域滚动                  │   │
│   │  · 识别文件类型（fileTypes.ts）                              │   │
│   │  · 调用对应 Format Provider 解析内容                         │   │
│   │  · 构建 Webview HTML（注入 CSS/JS 资源）                     │   │
│   │  · 与 Webview 双向 postMessage 通信                          │   │
│   │  · 暴露命令接口（zoom / locate / follow / expand...）        │   │
│   └─────────────────────┬────────────────────────────────────────┘   │
│                         │ parse(content, fileType)                   │
│                         ▼                                            │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │                  Format Providers（解析层）                  │   │
│   │                                                              │   │
│   │  markdownProvider.ts       → Markdown + front matter         │   │
│   │  latexPreviewProvider.ts   → LaTeX → HTML + KaTeX 占位       │   │
│   │  codePreviewProvider.ts    → JSON/YAML/TOML/XML → 树形 HTML  │   │
│   │  mermaidPreviewProvider.ts → Mermaid → 原始代码块            │   │
│   │  tablePreviewProvider.ts   → CSV/TSV → HTML 表格             │   │
│   │                                                              │   │
│   │  返回: { html, fileType, supportsLocate, headings? }         │   │
│   └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│   fileTypes.ts   — 文件扩展名 → FileType 映射 + 能力描述             │
│   i18n.ts        — 多语言字符串（en/zh-CN/zh-TW/zh-HK/ja-JP）        │
└─────────────────────────┬────────────────────────────────────────────┘
                          │ postMessage / onDidReceiveMessage
                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Webview（浏览器环境）                        │
│                                                                      │
│   resources/js/preview-*.js                                          │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │  · 接收 update 消息，将 HTML 注入 DOM                        │   │
│   │  · 触发 KaTeX 渲染（数学公式）                               │   │
│   │  · 触发 Mermaid 渲染（图表）                                 │   │
│   │  · 处理缩放（滚轮 + 命令）                                   │   │
│   │  · 处理编辑器 ↔ 预览双向定位/滚动同步                        │   │
│   │  · 代码块复制按钮交互                                        │   │
│   │  · Mermaid 图表拖拽平移                                      │   │
│   └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│   resources/css/*.css  — 按模块拆分的预览样式（含 common.css）       │
│   resources/vendor/                                                  │
│   ├── katex/             — 数学公式渲染库                            │
│   ├── mermaid/           — 图表渲染库                                │
│   └── codicons/          — VS Code 图标字体                          │
└──────────────────────────────────────────────────────────────────────┘

消息协议（Extension Host ↔ Webview）：
Host → Webview : update | loading | scrollToHeading | zoom |
                 expandAll | collapseAll | highlightDataTreeRange
Webview → Host : getVisibleHeading | locateEditor
```

---

## 数据流说明

1. **文件打开/切换**：VS Code 触发 `onDidChangeActiveTextEditor`，`PreviewProvider` 读取文档内容并识别文件类型。
2. **解析**：调用对应 Format Provider 的静态 `parse()` 方法，返回包含渲染好的 HTML 字符串及元数据的 `PreviewResult`。
3. **渲染**：将 HTML 通过 `postMessage({ type: 'update', ... })` 发送至 Webview；Webview 注入 DOM 后执行二次渲染（KaTeX、Mermaid）。
4. **定位同步**：编辑器滚动时，Host 计算可视区域对应的标题/节点，发送 `scrollToHeading` 消息；Webview 点击标题时，向 Host 发送 `locateEditor` 消息反向跳转。
5. **命令**：用户点击工具栏按钮，VS Code 命令触发 `PreviewProvider` 公开方法（如 `zoomIn()`），再通过 `postMessage` 通知 Webview 更新 UI 状态。
