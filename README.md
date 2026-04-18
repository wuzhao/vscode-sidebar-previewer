# Sidebar Previewer

![Version](https://img.shields.io/badge/version-0.3.0-blue.svg)

A VS Code extension that provides a preview panel in the Activity Bar sidebar.

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
