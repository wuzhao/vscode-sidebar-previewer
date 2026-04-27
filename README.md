# Sidebar Previewer

![Version](https://img.shields.io/badge/version-0.3.7-blue.svg) ![License](https://img.shields.io/badge/license-MIT-green.svg)

Language: [English](https://github.com/wuzhao/vscode-sidebar-previewer/blob/main/README.md) | [简体中文](https://github.com/wuzhao/vscode-sidebar-previewer/blob/main/README.zh-CN.md) | [繁體中文-台灣](https://github.com/wuzhao/vscode-sidebar-previewer/blob/main/README.zh-TW.md) | [繁體中文-香港](https://github.com/wuzhao/vscode-sidebar-previewer/blob/main/README.zh-HK.md) | [日本語](https://github.com/wuzhao/vscode-sidebar-previewer/blob/main/README.ja-JP.md)

Empower your VS Code Activity Bar with real-time rendering, scroll-sync, and zoom controls. Supports a wide range of formats covering Markdown, LaTeX, Mermaid, JSON, YAML, TOML, XML, CSV, and TSV.

## Why do you need it?

In the age of AI-driven development, documentation is now a first-class citizen, **processed locally and versioned directly in-repo**. With the secondary sidebar becoming a mainstream hub for AI workflows, conventional previewing feels cramped and clunky. Enter **Sidebar Previewer**: it delivers real-time rendering in your sidebar, allowing you to fluidly switch between coding and previewing, with an added presentation mode to cover your entire workflow.

## Project Repository

GitHub: [https://github.com/wuzhao/vscode-sidebar-previewer](https://github.com/wuzhao/vscode-sidebar-previewer)

## Screenshots

| | | |
| -- | -- | -- |
| Markdown ![Markdown](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/vscode-sidebar-previewer/md.png) | LaTeX ![LaTeX](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/vscode-sidebar-previewer/tex.png) | Mermaid ![Mermaid](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/vscode-sidebar-previewer/mmd.png) |
| CSV / TSV ![CSV / TSV](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/vscode-sidebar-previewer/csv.png) | JSON / YAML / TOML / XML ![JSON / YAML / TOML / XML](https://raw.githubusercontent.com/wuzhao/assets/main/screenshots/vscode-sidebar-previewer/json.png) | |

## Supported Files

| Type | Extensions |
| ---- | ---------- |
| Markdown | `.md`, `.markdown` |
| LaTeX | `.tex` |
| Mermaid | `.mmd`, `.mermaid` |
| JSON | `.json`, `.jsonc` |
| YAML | `.yaml`, `.yml` |
| TOML | `.toml` |
| XML | `.xml` |
| CSV | `.csv` |
| TSV | `.tsv` |

## Feature Overview

### Markdown

- Front matter table
- GitHub alert block rendering
- Task list checkbox toggle-writeback
- Code highlighting and copy button
- KaTeX and Mermaid block rendering
- Follow-scroll and locate between editor and preview

### LaTeX

- KaTeX rendering for inline formulas and common math environments
- Follow-scroll and locate between editor and preview
- Zoom support

### Mermaid

- Basic syntax precheck with clear error feedback
- Drag-to-pan interaction when zoomed

### JSON / YAML / TOML / XML

- Collapsible tree view
- Expand all / collapse all
- Click key to jump to source line
- Comment icon on keys with hover tooltip

### CSV / TSV

- Render as a table for preview with sticky first row and first column
- Follow-scroll and locate between editor and preview
- Bidirectional selection with click-and-drag support and Cmd/Ctrl+C to copy selected cells as TSV

## Installation

### Install from VS Code Marketplace

1. Open VS Code
2. Open Extensions view (`Cmd+Shift+X` on Mac, `Ctrl+Shift+X` on Windows/Linux)
3. Search for `Sidebar Previewer`
4. Click "**Install**" on the extension

> Or install from the extension page: [Sidebar Previewer on VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MG12.sidebar-previewer)

### Build and install from source

1. Clone the repository: `git clone https://github.com/wuzhao/vscode-sidebar-previewer.git`
2. Enter the project folder: `cd vscode-sidebar-previewer`
3. Install dependencies: `npm install`
4. Build extension output and bundled assets: `npm run package:vsix`
5. Package the VSIX: `npx @vscode/vsce package`
6. In VS Code, run `Extensions: Install from VSIX` and select the generated `sidebar-previewer-<version>.vsix`

## Usage

1. Open any supported file (`.md`, `.markdown`, `.tex`, `.mmd`, `.mermaid`, `.json`, `.jsonc`, `.yaml`, `.yml`, `.toml`, `.xml`, `.csv`, `.tsv`)
2. Click the Sidebar Previewer icon in the Activity Bar
3. The preview panel automatically renders the current file
4. Use toolbar buttons or `Cmd/Ctrl` + mouse wheel to zoom
5. In Mermaid preview, drag the diagram to pan
6. In JSON/YAML/TOML/XML preview, click keys to locate source lines; CSV/TSV preview is rendered as a table with sticky headers, click cells to locate, and scroll follow support

## How to show the VS Code Secondary Side Bar?

1. Open the Command Palette and run `View: Toggle Secondary Side Bar`
2. Or use menu path `View > Appearance > Secondary Side Bar`
3. If needed, drag the Sidebar Previewer view into the Secondary Side Bar area

## Acknowledgements

- [marked](https://github.com/markedjs/marked): parses Markdown into HTML for preview rendering.
- [mermaid](https://github.com/mermaid-js/mermaid): renders Mermaid diagram blocks in Markdown and `.mmd/.mermaid` files.
- [katex](https://github.com/KaTeX/KaTeX): renders math formulas for Markdown and LaTeX preview.
- [highlight.js](https://github.com/highlightjs/highlight.js): provides syntax highlighting for code blocks.
- [js-yaml](https://github.com/nodeca/js-yaml): parses YAML data for structured preview.
- [toml](https://github.com/BinaryMuse/toml-node): parses TOML data for structured preview.

## License

MIT
