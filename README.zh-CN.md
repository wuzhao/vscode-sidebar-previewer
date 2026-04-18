# Sidebar Previewer

一个 VS Code 扩展，在 Activity Bar 侧边栏提供文件预览面板，支持多种文件格式，提供滚动同步、树形视图、代码高亮和缩放控制。

## 支持的文件类型

| 文件类型 | 扩展名 |
|---------|--------|
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
