# Sidebar Previewer

![Version](https://img.shields.io/badge/version-0.3.4-blue.svg) ![License](https://img.shields.io/badge/license-MIT-green.svg)

Language: [English](./README.md) | [简体中文](./README.zh-CN.md) | [繁體中文-台灣](./README.zh-TW.md) | [繁體中文-香港](./README.zh-HK.md) | [日本語](./README.ja-JP.md)

VS Code 嘅側邊欄預覽器，支持實時渲染、滾動同步、樹形視圖、縮放控制等功能，支持包括 Markdown、$LaTeX$、Mermaid、JSON、YAML、TOML、XML、CSV 同埋 TSV 喺內嘅多種文件格式。

## 點解需要用到佢？

如今 AI 已經改變咗我哋 Coding 嘅方式，文檔亦都進化到 **本地處理 + 源碼共生** 嘅新階段。而家嘅編輯器入面，第二側邊欄先至係 AI 時代嘅主戰場。與其喺畫面之間侷促跳轉，不如用 **Sidebar Previewer** 為你化繁為簡：文檔喺側邊欄實時呈現，Code 同預覽並肩而行。無論係埋頭構建定係全屏演示，你嘅工作流從此告別割裂，盡享無縫切換。

## 項目地址

GitHub: [https://github.com/wuzhao/vscode-sidebar-previewer](https://github.com/wuzhao/vscode-sidebar-previewer)

## 功能截圖

| Type | Screenshot |
| ---- | ---------- |
| Markdown | ![Markdown Preview Screenshot](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/markdown.png) |
| LaTeX | ![Latex Preview Screenshot](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/latex.png) |
| Mermaid | ![Mermaid Preview Screenshot](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/mermaid.png) |
| JSON&nbsp;/&nbsp;YAML&nbsp;/&nbsp;TOML&nbsp;/&nbsp;XML&nbsp;/&nbsp;CSV&nbsp;/&nbsp;TSV | ![YAML Preview Screenshot](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/yaml.png) |

## 支持的文件類型

| 文件類型 | 擴展名 |
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

## 功能介紹

### Markdown

- Front Matter 屬性表格
- GitHub Alert 提示塊渲染
- 任務列表勾選回寫
- 代碼高亮同埋複製掣
- KaTeX 同 Mermaid 代碼塊渲染
- 編輯器同預覽之間嘅滾動同步、互相定位

### LaTeX

- 行內公式同埋常見數學環境嘅 KaTeX 渲染
- 編輯器同預覽之間嘅滾動同步、互相定位
- 支持縮放功能

### Mermaid

- 基礎語法預檢查同埋錯誤提示
- 放大咗之後支持拖拽平移

### JSON / YAML / TOML / XML / CSV / TSV

- 可摺疊樹形視圖
- 全部展開 / 全部摺疊
- 點擊鍵名跳轉源碼行
- JSON 支持註解同尾隨逗號解析模式
- 有註解嘅鍵會顯示註解圖示，滑鼠停留可以睇到註解內容
- CSV / TSV 預覽會渲染成 HTML 表格

## 安裝方法

### 通過 VS Code 外掛市場安裝

1. 打開 VS Code
2. 打開擴充功能視窗（Mac：`Cmd+Shift+X`，Windows/Linux：`Ctrl+Shift+X`）
3. 搜尋 `Sidebar Previewer`
4. 喺擴充功能卡片撳「Install」安裝

> 或者直接喺 Marketplace 頁面安裝：[Sidebar Previewer on VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MG12.sidebar-previewer)

### 從源碼編譯同埋安裝

1. Clone 倉庫：`git clone https://github.com/wuzhao/vscode-sidebar-previewer.git`
2. 進入目錄：`cd vscode-sidebar-previewer`
3. 安裝依賴：`npm install`
4. 構建擴展產物同埋靜態資源：`npm run package:vsix`
5. 打包 VSIX：`npx @vscode/vsce package`
6. 喺 VS Code 入面執行 `Extensions: Install from VSIX`，揀返生成咗嘅 `sidebar-previewer-<version>.vsix`

## 使用方法

1. 打開任何支持嘅文件（`.md`、`.markdown`、`.tex`、`.mmd`、`.mermaid`、`.json`、`.jsonc`、`.yaml`、`.yml`、`.toml`、`.xml`、`.csv`、`.tsv`）
2. 點擊左邊 Activity Bar 入面個 Sidebar Previewer 圖標
3. 預覽面板會自動顯示當前文件嘅渲染結果
4. 使用工具欄或者 `Cmd/Ctrl` + 鼠標滾輪嚟縮放
5. Mermaid 預覽支持拖拽嚟睇放大咗嘅區域
6. JSON / YAML / TOML / XML 可以點擊鍵名跳返去源碼對應嗰行；CSV / TSV 會以表格方式預覽

## 點樣顯示 VS Code 第二側邊欄？

1. 打開命令面板，執行 `View: Toggle Secondary Side Bar`
2. 或者通過菜單 `View > Appearance > Secondary Side Bar`
3. 如果有需要，可以將 Sidebar Previewer 視圖拖去第二側邊欄區域

## 致謝

- [marked](https://github.com/markedjs/marked)：將 Markdown 解析為 HTML，用於預覽渲染。
- [mermaid](https://github.com/mermaid-js/mermaid)：渲染 Markdown 及 `.mmd/.mermaid` 檔案中的 Mermaid 圖表區塊。
- [katex](https://github.com/KaTeX/KaTeX)：渲染 Markdown 和 LaTeX 預覽中的數學公式。
- [highlight.js](https://github.com/highlightjs/highlight.js)：為程式碼區塊提供語法高亮。
- [js-yaml](https://github.com/nodeca/js-yaml)：解析 YAML 數據，用於結構化預覽。
- [toml](https://github.com/BinaryMuse/toml-node)：解析 TOML 數據，用於結構化預覽。

## 許可證

MIT
