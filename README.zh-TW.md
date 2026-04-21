# Sidebar Previewer

![Version](https://img.shields.io/badge/version-0.3.2-blue.svg) ![License](https://img.shields.io/badge/license-MIT-green.svg)

Language: [English](./README.md) | [簡體中文](./README.zh-CN.md) | [繁體中文-臺灣](./README.zh-TW.md) | [繁體中文-香港](./README.zh-HK.md) | [日本語](./README.ja-JP.md)

VS Code 的側邊欄預覽器，支援實時渲染、滾動同步、樹形檢視、縮放控制等功能，多檔案格式支援包括 Markdown、LaTeX、Mermaid、JSON、YAML 和 TOML。

## 為什麼需要它？

當 AI 改變了我們寫程式碼的方式，文件也進化到了 **本地處理 + 原始碼共生** 的新階段。現在的編輯器裡，第二側邊欄才是 AI 時代的主戰場。與其在標籤頁間侷促跳轉，不如讓 **Sidebar Previewer** 為你化繁為簡：文件在側邊欄實時呈現，程式碼與預覽並肩而行。無論是埋頭構建還是全屏演示，你的工作流從此告別割裂，盡享無縫切換。

## 專案地址

GitHub: [https://github.com/wuzhao/vscode-sidebar-previewer](https://github.com/wuzhao/vscode-sidebar-previewer)

## 功能截圖

| Type | Screenshot |
| ---- | ---------- |
| Markdown | ![Markdown Preview Screenshot](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/markdown.png) |
| LaTeX | ![Latex Preview Screenshot](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/latex.png) |
| Mermaid | ![Mermaid Preview Screenshot](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/mermaid.png) |
| JSON&nbsp;/&nbsp;YAML&nbsp;/&nbsp;TOML | ![YAML Preview Screenshot](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/yaml.png) |

## 支援的檔案型別

| 檔案型別 | 副檔名 |
| ------- | ------ |
| Markdown | `.md`、`.markdown` |
| LaTeX | `.tex` |
| Mermaid | `.mmd`、`.mermaid` |
| JSON | `.json` |
| YAML | `.yaml`、`.yml` |
| TOML | `.toml` |

## 功能介紹

### Markdown

- Front Matter 屬性表格
- GitHub Alert 提示塊渲染
- 任務列表勾選回寫
- 程式碼高亮與複製按鈕
- KaTeX 和 Mermaid 程式碼塊渲染
- 編輯器與預覽之間滾動同步、互相定位

### LaTeX

- 行內公式與常見數學環境的 KaTeX 渲染
- 編輯器與預覽之間滾動同步、互相定位
- 支援縮放

### Mermaid

- 基礎語法預檢查與錯誤提示
- 放大後支援拖拽平移

### JSON / YAML / TOML

- 可摺疊樹形檢視
- 全部展開 / 全部摺疊
- 點選鍵名跳轉原始碼行

## 安裝方法

### 透過 VSIX 安裝

1. 開啟 VS Code
2. 按 `Cmd+Shift+P`（Mac）或 `Ctrl+Shift+P`（Windows/Linux）
3. 執行 `Extensions: Install from VSIX`
4. 選擇提供的 `.vsix` 安裝包

### 從原始碼編譯並安裝

1. 克隆倉庫：`git clone https://github.com/wuzhao/vscode-sidebar-previewer.git`
2. 進入目錄：`cd vscode-sidebar-previewer`
3. 安裝依賴：`npm install`
4. 構建擴充套件產物和靜態資源：`npm run package:vsix`
5. 打包 VSIX：`npx @vscode/vsce package`
6. 在 VS Code 中執行 `Extensions: Install from VSIX`，選擇生成的 `sidebar-previewer-<version>.vsix`

## 使用方法

1. 開啟任意支援的檔案（`.md`、`.markdown`、`.tex`、`.mmd`、`.mermaid`、`.json`、`.yaml`、`.yml`、`.toml`）
2. 點選左側 Activity Bar 中的 Sidebar Previewer 圖示
3. 預覽面板會自動顯示當前檔案的渲染結果
4. 使用工具欄或 `Cmd/Ctrl` + 滑鼠滾輪進行縮放
5. Mermaid 預覽支援拖拽檢視放大區域
6. JSON / YAML / TOML 可點選鍵名跳轉到原始碼對應行

## 如何顯示 VS Code 第二側邊欄？

1. 開啟命令面板，執行 `View: Toggle Secondary Side Bar`
2. 或透過選單 `View > Appearance > Secondary Side Bar`
3. 如有需要，把 Sidebar Previewer 檢視拖到第二側邊欄區域

## 致謝

- [marked](https://github.com/markedjs/marked): parses Markdown into HTML for preview rendering.
- [mermaid](https://github.com/mermaid-js/mermaid): renders Mermaid diagram blocks in Markdown and `.mmd/.mermaid` files.
- [katex](https://github.com/KaTeX/KaTeX): renders math formulas for Markdown and LaTeX preview.
- [highlight.js](https://github.com/highlightjs/highlight.js): provides syntax highlighting for code blocks.
- [js-yaml](https://github.com/nodeca/js-yaml): parses YAML data for structured preview.
- [toml](https://github.com/BinaryMuse/toml-node): parses TOML data for structured preview.

## 許可證

Licensed under the [MIT License](./LICENSE).
