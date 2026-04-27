# Changelog

## 0.3.8 - 2026-04-28

- Added focus-aware selection colors for CSV/TSV cells and JSON/YAML/TOML/XML tree items (focused: blue, unfocused: gray).
- CSV/TSV multi-cell selection now shows a floating `Actions` menu with `Copy As ASCII` and `Copy As TSV`.
- CSV/TSV supports `Cmd/Ctrl+C` to copy the selected area.

～～～

- CSV/TSV 单元格与 JSON/YAML/TOML/XML 树节点新增焦点态高亮（获得焦点为蓝色，失焦为灰色）。
- CSV/TSV 多单元格选区新增浮动 `Actions` 操作菜单，支持 `复制为 ASCII` 和 `复制为 TSV`。
- CSV/TSV 支持 `Cmd/Ctrl+C` 复制选中区域。

---

## 0.3.7 - 2026-04-27

- Disabled context menu in webview preview.
- Fixed the first separator `hr (---)` cannot be displayed.
- Refactored preview.js into modular domain-based files with lazy-loading and comprehensive code comments.
- Fixed comment tooltip position drift after zoom on JSON/YAML/TOML/XML data trees.
- CSV/TSV table: disabled content modification.
- CSV/TSV table: added scroll follow, locate in editor, and locate in preview support.

～～～

- 禁用 Webview 预览界面的右键菜单。
- 修复第一个内容分隔符 `hr (---)` 不能显示的问题。
- 重构 preview.js 按业务拆分为独立模块，实现按需加载，并增加全面代码注释。
- 修复 JSON/YAML/TOML/XML 数据树在缩放后注释弹窗位置偏移的问题。
- CSV/TSV 禁止对表格内容进行修改。
- CSV/TSV 表格新增跟随滚动、编辑器定位与预览定位支持。

---

## 0.3.6 - 2026-04-25

- Unified project docs and metadata consistency (README badges, localized descriptions, architecture notes, naming normalization).
- Hardened webview message handling with defensive normalization for zoom/line payloads and render payload shape checks.
- Fixed Markdown fenced-code interference in task checkbox line mapping and heading extraction.
- Fixed Markdown locate behavior at document top by anchoring frontmatter table as `frontmatter-table`.
- Improved Mermaid precheck to support leading comments before the first diagram declaration.
- Added sticky first row and first column in CSV/TSV table preview.
- Fixed zoom behavior for data-tree comment popups so tooltip scale and anchor position stay aligned with comment icons.
- Fixed table preview container height calculation on zoom to prevent overflow.

～～～

- 统一项目文档与元数据一致性（README 版本徽章、多语言描述、架构说明、命名规范）。
- 强化 Webview 消息处理，新增 zoom/line 入参归一化与渲染 payload 结构防御校验。
- 修复 Markdown 在 fenced code block 场景下对 task 勾选行号映射与标题提取的干扰。
- 修复 Markdown 顶部定位场景，frontmatter 表格新增 `frontmatter-table` 锚点以保证稳定落位。
- 优化 Mermaid 预检逻辑，支持「前置注释 + 图声明」的文件结构。
- CSV/TSV 预览新增首行与首列固定，长表格浏览更稳定。
- 修复数据树注释弹窗在缩放后的表现，使弹窗缩放与锚点位置始终跟随注释图标。
- 修复缩放状态下表格预览容器高度计算问题，避免内容溢出或留白。

---

## 0.3.5 - 2026-04-24

- Added XML sidebar preview support with JSON-like tree rendering.
- Added CSV and TSV preview support as readable HTML tables.
- Added richer regression tests for JSON/YAML/TOML/XML comment ownership and rendering scope.
- Improved TOML key location strategy using path-aware mapping for nested tables.
- Fixed comment placement at nested scope vs document tail across JSON/YAML/TOML/XML.
- Fixed JSON/JSONC array/object tail comment ownership.
- Fixed TOML parent/child table order issue where parent locate/comment could be shadowed by earlier child table.

～～～

- 新增 XML 侧边栏预览，采用类 JSON 的树形结构展示。
- 新增 CSV/TSV 预览，支持以 HTML 表格方式查看。
- 新增更完整的回归测试，覆盖 JSON/YAML/TOML/XML 注释归属与渲染层级。
- TOML key 定位策略升级为路径感知映射，更适配嵌套 table 场景。
- 修复 JSON/YAML/TOML/XML 在「嵌套作用域」和「文档末尾」的注释落位问题。
- 修复 JSON/JSONC 数组与对象尾部注释归属。
- 修复 TOML 父子 table 顺序问题，避免父节点被前置子节点错误抢占定位或注释。
