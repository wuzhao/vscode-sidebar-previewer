# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-04-20

### Added

- Added a new toolbar feedback action `Sidebar Previewer: Feedback` that opens the GitHub Issues page.
- Added current-line / current-selection-range highlight behavior for JSON, YAML, and TOML tree previews.
- Added a source build and install path in both README files (`npm install`, `npm run package:vsix`, `npx @vscode/vsce package`).
- Added explicit guidance in both README files for showing the VS Code Secondary Side Bar.
- Added mutual language entry links between English and Chinese README files using full GitHub URLs.
- Added project GitHub repository links in both README files.
- Added `REVIEW.md` with a manual acceptance checklist for human validation.

### Changed

- Reorganized the view toolbar actions into 3 groups with separators:
  - Zoom group: zoom out, reset zoom, zoom in.
  - Locate group: locate editor, locate preview, follow lock.
  - Feedback group: feedback entry at the right-most group.
- Removed data-tree forced auto-expand-on-edit behavior and replaced it with non-intrusive highlight behavior.
- Updated Chinese README screenshot links to absolute URLs for compatibility with platforms that do not resolve relative links.
