# Sidebar Previewer

一个 VS Code 扩展，在 Activity Bar 侧边栏提供文件预览面板，支持多种文件格式，提供滚动同步、树形视图、代码高亮和缩放控制。

## 初衷

在 AI + CLI 的时代，文档越来越常以“本地化处理 + 直接入仓”的方式成为交付流程的一部分。与此同时，AI Coding 工作流让编辑器的第二侧边栏逐步成为主流工作区。这个插件的目标就是让这类工作流更顺畅：一边编辑一边快速看到渲染效果，或者在需要时切换到更适合全屏讲稿/阅读的展示方式。

## 支持的文件类型

| 文件类型 | 扩展名 |
| ------- | ------ |
| Markdown | `.md`、`.markdown` |
| LaTeX | `.tex` |
| Mermaid | `.mmd`、`.mermaid` |
| JSON | `.json` |
| YAML | `.yaml`、`.yml` |
| TOML | `.toml` |

## 功能介绍

### Markdown

- Front Matter 属性表格
- GitHub Alert 提示块渲染
- 任务列表勾选回写
- 代码高亮与复制按钮
- KaTeX 和 Mermaid 代码块渲染
- 编辑器与预览之间滚动同步、互相定位

### LaTeX

- 行内公式与常见数学环境的 KaTeX 渲染
- 编辑器与预览之间滚动同步、互相定位
- 支持缩放

### Mermaid

- `.mmd` 和 `.mermaid` 图表渲染
- 基础语法预检查与错误提示
- 放大后支持拖拽平移

### JSON / YAML / TOML

- 可折叠树形视图
- 全部展开 / 全部折叠
- 点击键名跳转源码行

## 安装方法

### 通过 VSIX 安装

1. 打开 VS Code
2. 按 `Cmd+Shift+P`（Mac）或 `Ctrl+Shift+P`（Windows/Linux）
3. 执行 `Extensions: Install from VSIX`
4. 选择提供的 `.vsix` 安装包

## 使用方法

1. 打开任意支持的文件（`.md`、`.markdown`、`.tex`、`.mmd`、`.mermaid`、`.json`、`.yaml`、`.yml`、`.toml`）
2. 点击左侧 Activity Bar 中的 Sidebar Previewer 图标
3. 预览面板会自动显示当前文件的渲染结果
4. 使用工具栏或 `Cmd/Ctrl` + 鼠标滚轮进行缩放
5. Mermaid 预览支持拖拽查看放大区域
6. JSON / YAML / TOML 可点击键名跳转到源码对应行

## 许可证

MIT

## 致谢

- [Visual Studio Code Extension API](https://code.visualstudio.com/api)：提供扩展运行时能力、命令体系、Webview 集成和侧边栏容器集成。
- [marked](https://github.com/markedjs/marked)：将 Markdown 解析为 HTML，用于预览渲染。
- [mermaid](https://github.com/mermaid-js/mermaid)：渲染 Markdown 代码块及 `.mmd/.mermaid` 文件中的流程图与图表。
- [katex](https://github.com/KaTeX/KaTeX)：渲染 Markdown / LaTeX 预览中的数学公式。
- [highlight.js](https://github.com/highlightjs/highlight.js)：提供代码块语法高亮能力。
- [js-yaml](https://github.com/nodeca/js-yaml)：解析 YAML 数据并生成结构化预览。
- [toml](https://github.com/BinaryMuse/toml-node)：解析 TOML 数据并生成结构化预览。
- [@vscode/codicons](https://github.com/microsoft/vscode-codicons)：提供扩展界面使用的图标资源。
- [TypeScript](https://www.typescriptlang.org/)：用于编译与类型检查扩展源码。
- [@types/vscode](https://www.npmjs.com/package/@types/vscode)：提供 VS Code API 的 TypeScript 类型定义。
- [@types/node](https://www.npmjs.com/package/@types/node)：提供 Node.js 运行时 API 的 TypeScript 类型定义。
- [@types/js-yaml](https://www.npmjs.com/package/@types/js-yaml)：提供 `js-yaml` 的 TypeScript 类型定义。
