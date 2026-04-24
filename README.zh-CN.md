# Sidebar Previewer

![Version](https://img.shields.io/badge/version-0.3.5-blue.svg) ![License](https://img.shields.io/badge/license-MIT-green.svg)

Language: [English](./README.md) | [简体中文](./README.zh-CN.md) | [繁體中文-台灣](./README.zh-TW.md) | [繁體中文-香港](./README.zh-HK.md) | [日本語](./README.ja-JP.md)

VS Code 的侧边栏预览器，支持实时渲染、滚动同步、树形视图、缩放控制等功能，多文件格式支持包括 Markdown、LaTeX、Mermaid、JSON、YAML、TOML、XML、CSV 和 TSV。

## 为什么需要它？

当 AI 改变了我们写代码的方式，文档也进化到了 **本地处理 + 源码共生** 的新阶段。现在的编辑器里，第二侧边栏才是 AI 时代的主战场。与其在标签页间局促跳转，不如让 **Sidebar Previewer** 为你化繁为简：文档在侧边栏实时呈现，代码与预览并肩而行。无论是埋头构建还是全屏演示，你的工作流从此告别割裂，尽享无缝切换。

## 项目地址

GitHub: [https://github.com/wuzhao/vscode-sidebar-previewer](https://github.com/wuzhao/vscode-sidebar-previewer)

## 功能截图

| | | |
| -- | -- | -- |
| Markdown ![Markdown](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/vscode-sidebar-previewer/md.png) | LaTex ![LaTex](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/vscode-sidebar-previewer/tex.png) | Mermaid ![Mermaid](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/vscode-sidebar-previewer/mmd.png) |
| CSV / TSV ![CSV / TSV](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/vscode-sidebar-previewer/csv.png) | JSON / YAML / TOML / XML ![JSON / YAML / TOML / XML](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/vscode-sidebar-previewer/json.png) | |

## 支持的文件类型

| 文件类型 | 扩展名 |
| ------- | ------ |
| Markdown | `.md`、`.markdown` |
| LaTeX | `.tex` |
| Mermaid | `.mmd`、`.mermaid` |
| JSON | `.json`、`.jsonc` |
| YAML | `.yaml`、`.yml` |
| TOML | `.toml` |
| XML | `.xml` |
| CSV | `.csv` |
| TSV | `.tsv` |

## 功能介绍

### Markdown

- Front Matter 属性表格
- GitHub Alert 提示块渲染
- 任务列表勾选回写
- 代码高亮与复制按钮
- KaTeX 和 Mermaid 代码块渲染
- 编辑器与预览之间滚动同步、互相定位

### Mermaid

- 基础语法预检查与错误提示
- 放大后支持拖拽平移

### LaTeX

- 行内公式与常见数学环境的 KaTeX 渲染
- 编辑器与预览之间滚动同步、互相定位
- 支持缩放

### JSON / YAML / TOML / XML

- 可折叠树形视图
- 全部展开 / 全部折叠
- 点击键名跳转源码行
- 带注释的键会显示注释图标，悬停可查看注释内容

### CSV / TSV

- 渲染为表格预览

## 安装方法

### 通过 VS Code 插件市场安装

1. 打开 VS Code
2. 打开扩展视图（Mac：`Cmd+Shift+X`，Windows/Linux：`Ctrl+Shift+X`）
3. 搜索 `Sidebar Previewer`
4. 在扩展卡片上点击「安装」

> 也可以从插件页面直接安装：[Sidebar Previewer 插件详情页](https://marketplace.visualstudio.com/items?itemName=MG12.sidebar-previewer)

### 从源码编译并安装

1. 克隆仓库：`git clone https://github.com/wuzhao/vscode-sidebar-previewer.git`
2. 进入目录：`cd vscode-sidebar-previewer`
3. 安装依赖：`npm install`
4. 构建扩展产物和静态资源：`npm run package:vsix`
5. 打包 VSIX：`npx @vscode/vsce package`
6. 在 VS Code 中执行 `Extensions: Install from VSIX`，选择生成的 `sidebar-previewer-<version>.vsix`

## 使用方法

1. 打开任意支持的文件（`.md`、`.markdown`、`.tex`、`.mmd`、`.mermaid`、`.json`、`.jsonc`、`.yaml`、`.yml`、`.toml`、`.xml`、`.csv`、`.tsv`）
2. 点击左侧 Activity Bar 中的 Sidebar Previewer 图标
3. 预览面板会自动显示当前文件的渲染结果
4. 使用工具栏或 `Cmd/Ctrl` + 鼠标滚轮进行缩放
5. Mermaid 预览支持拖拽查看放大区域
6. JSON / YAML / TOML / XML 可点击键名跳转到源码对应行；CSV / TSV 预览为表格视图

## 如何显示 VS Code 第二侧边栏？

1. 打开命令面板，执行 `View: Toggle Secondary Side Bar`
2. 或通过菜单 `View > Appearance > Secondary Side Bar`
3. 如有需要，把 Sidebar Previewer 视图拖到第二侧边栏区域

## 致谢

- [marked](https://github.com/markedjs/marked)：将 Markdown 解析为 HTML，用于预览渲染。
- [mermaid](https://github.com/mermaid-js/mermaid)：渲染 Markdown 及 `.mmd/.mermaid` 文件中的 Mermaid 图表块。
- [katex](https://github.com/KaTeX/KaTeX)：渲染 Markdown 和 LaTeX 预览中的数学公式。
- [highlight.js](https://github.com/highlightjs/highlight.js)：为代码块提供语法高亮。
- [js-yaml](https://github.com/nodeca/js-yaml)：解析 YAML 数据，用于结构化预览。
- [toml](https://github.com/BinaryMuse/toml-node)：解析 TOML 数据，用于结构化预览。

## 许可证

MIT
