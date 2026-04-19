# Sidebar Previewer

![Version](https://img.shields.io/badge/version-0.3.0-blue.svg)

A VS Code extension that provides a preview panel in the Activity Bar sidebar.

## Motivation

In the AI + CLI era, documentation is increasingly created, localized, and versioned directly inside source repositories as a first-class part of delivery. At the same time, AI Coding workflows have made the second sidebar a mainstream working area in editors. This extension exists to make that workflow smoother: you can edit and instantly see rendered output, or switch to full-screen style reading/presentation when needed.

## Supported Files

| Type | Extensions |
| ---- | ---------- |
| Markdown | `.md`, `.markdown` |
| LaTeX | `.tex` |
| Mermaid | `.mmd`, `.mermaid` |
| JSON | `.json` |
| YAML | `.yaml`, `.yml` |
| TOML | `.toml` |

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

- Diagram rendering for `.mmd` and `.mermaid`
- Basic syntax precheck with clear error feedback
- Drag-to-pan interaction when zoomed

### JSON / YAML / TOML

- Collapsible tree view
- Expand all / collapse all
- Click key to jump to source line

## Installation

### Install from VSIX

1. Open VS Code
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
3. Run `Extensions: Install from VSIX`
4. Select the provided `.vsix` package

## Usage

1. Open any supported file (`.md`, `.markdown`, `.tex`, `.mmd`, `.mermaid`, `.json`, `.yaml`, `.yml`, `.toml`)
2. Click the Sidebar Previewer icon in the Activity Bar
3. The preview panel automatically renders the current file
4. Use toolbar buttons or `Cmd/Ctrl` + mouse wheel to zoom
5. In Mermaid preview, drag the diagram to pan
6. In JSON/YAML/TOML preview, click keys to locate source lines

## License

MIT

## Acknowledgements

- [Visual Studio Code Extension API](https://code.visualstudio.com/api): provides extension runtime APIs, commands, webview integration, and sidebar container integration.
- [marked](https://github.com/markedjs/marked): parses Markdown into HTML for preview rendering.
- [mermaid](https://github.com/mermaid-js/mermaid): renders Mermaid diagram blocks in Markdown and `.mmd/.mermaid` files.
- [katex](https://github.com/KaTeX/KaTeX): renders math formulas for Markdown/LaTeX preview.
- [highlight.js](https://github.com/highlightjs/highlight.js): provides syntax highlighting for code blocks.
- [js-yaml](https://github.com/nodeca/js-yaml): parses YAML data for structured preview.
- [toml](https://github.com/BinaryMuse/toml-node): parses TOML data for structured preview.
- [@vscode/codicons](https://github.com/microsoft/vscode-codicons): supplies icon assets used in the extension UI.
- [TypeScript](https://www.typescriptlang.org/): compiles and type-checks extension source code.
- [@types/vscode](https://www.npmjs.com/package/@types/vscode): provides TypeScript typings for VS Code APIs.
- [@types/node](https://www.npmjs.com/package/@types/node): provides TypeScript typings for Node.js runtime APIs.
- [@types/js-yaml](https://www.npmjs.com/package/@types/js-yaml): provides TypeScript typings for `js-yaml`.
