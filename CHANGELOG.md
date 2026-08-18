# Changelog

## 0.4.2 - 2026-08-14

- Aligned Markdown code-block copy controls with table copy controls and kept copy feedback below the Skeleton Outline.
- Rendered Markdown headings with the link color, and enhanced frontmatter lists and compound values with non-wrapping tags and structured JSON.
- Unified copy success feedback as icon-only controls that retain the original code-block or split-button dimensions.
- Added an icon-only Word Wrap toggle beside Markdown code-block copy buttons.

～～～

- Markdown 代码块复制控件现在与表格复制控件保持一致，并确保复制反馈不会遮挡 Skeleton Outline。
- Markdown 标题改用链接色，frontmatter 列表与复合值分别优化为不折行标签和结构化 JSON。
- 统一复制成功提示为纯图标，并保持代码块按钮或分体按钮组的原始尺寸。
- 在 Markdown 代码块复制按钮左侧新增纯图标自动折行切换按钮。

## 0.4.1 - 2026-07-28

- Refined Markdown Skeleton Outline widths based on the heading levels present in the document.
- Unified Markdown and CSV/TSV table copy menus with Markdown, ASCII, TSV, and CSV formats, including spreadsheet compatibility guidance for TSV.
- Markdown table copy now preserves cell source formatting, normalizes separators, retains right/center alignment, aligns columns by display width, and avoids appending extra rows.
- Improved table copy interactions by keeping dropdown menus reachable and showing fixed-duration `Copied` feedback for buttons and CSV/TSV keyboard copies.
- Added interactive Task List checkboxes inside Markdown table cells, with task markers preserved when copying tables.
- Removed the Feedback entry from every preview title bar.

～～～

- 根据文档中实际存在的标题层级优化 Markdown Skeleton Outline 宽度。
- 统一 Markdown 与 CSV/TSV 表格复制菜单，提供 Markdown、ASCII、TSV 和 CSV 格式，并为 TSV 补充电子表格兼容性说明。
- Markdown 表格复制现在会保留单元格源码格式、规范化分隔线、保留右对齐与居中、按显示宽度对齐各列，并避免在末尾追加多余行。
- 优化表格复制交互：下拉菜单保持可达，按钮复制及 CSV/TSV 快捷键复制均显示固定时长的 `Copied` 提示。
- 新增 Markdown 表格单元格内的可交互 Task List 复选框，复制表格时会保留任务标记。
- 移除所有预览标题栏中的 Feedback 入口。

## 0.4.0 - 2026-07-10

- Added Markdown Skeleton Outline with level-aware visual markers and a hover table of contents for instant heading navigation.
- Follow-scroll lock now remembers its previous state between extension sessions.

～～～

- 新增 Markdown Skeleton Outline：按标题层级显示概览，悬停打开目录并可瞬间跳转到对应标题。
- 滚动锁现在会在扩展会话之间记住上次状态。

## 0.3.17 - 2026-06-13

- Refined Markdown frontmatter preview with a dedicated wrapper container, key icon markers, and long-key truncation for better readability.
- Improved CSV/TSV table visual consistency with updated border and stripe styling details.

～～～

- 优化 Markdown frontmatter 预览：新增独立包裹容器、键名图标标识，并改进长键名截断展示。
- 调整 CSV/TSV 表格边框与斑马纹细节，提升整体视觉一致性。

## 0.3.16 - 2026-05-27

- Added JSONL (`.jsonl`) sidebar preview with data-tree rendering and interaction behavior aligned with JSON.
- Fixed CSV/TSV multi-cell copy action buttons being clipped near the bottom edge for short tables.

～～～

- 新增 JSONL（`.jsonl`）侧边栏预览，数据树渲染与交互行为与 JSON 保持一致。
- 修复 CSV/TSV 在短表格场景下多单元格复制按钮可能被底部边界裁剪的问题。

## 0.3.15 - 2026-05-12

- Fixed the copy button is displayed in the wrong position within Markdown code blocks.
- Fixed TOML inline-table locate mapping so child keys under inline objects can be clicked reliably in the data tree.
- Updated TOML inline-table comment ownership so comments on parent keys no longer appear on each inline child key.
- Normalized copied data-tree locators for JSON/YAML/TOML/XML to avoid duplicated leading dots and improve jq/yq compatibility.

～～～

- 修复 Markdown 的代码框中，复制代码按钮显示位置的问题
- 修复 TOML 内联表定位映射，数据树中可稳定点击内联对象子键并跳转到源码对应行。
- 调整 TOML 内联表注释归属，父键行内注释不再重复显示在各子键上。
- 优化 JSON/YAML/TOML/XML 复制定位路径的归一化，避免前导点重复，提升 jq/yq 等命令兼容性。

## 0.3.14 - 2026-05-09

- Added multi-cell quick action `Copy as Markdown Table` for CSV/TSV preview, while keeping `Copy as ASCII Table` and `Cmd/Ctrl+C` TSV copy behavior.

～～～

- CSV/TSV 预览新增多单元格快捷操作 `Copy as Markdown Table`，并保留 `Copy as ASCII Table` 与 `Cmd/Ctrl+C` 的 TSV 复制行为。

## 0.3.13 - 2026-05-08

- Data-tree locator replication is supported now for JSON/YAML/TOML/XML.
- Added LaTeX file extension support for `.katex` and `.latex` in file type detection.

～～～

- JSON/YAML/TOML/XML 支持复制定位路径。
- 文件类型识别新增 LaTeX 扩展名支持：`.katex` 与 `.latex`。

## 0.3.12 - 2026-05-06

- Updated Mermaid default zoom to 200% with doubled zoom step for Mermaid previews, and fixed file-switch initialization so text scales with diagram.
- Preview zoom now resets to 100% whenever switching files.
- Preview state is now fully reinitialized on every file switch, including same-type files.
- Fixed JSON/JSONC deep nested array-object locate mapping for inline object keys to resolve no-response clicks and wrong target lines.

～～～

- 将 Mermaid 预览默认缩放调整为 200%，并将 Mermaid 缩放步进翻倍；修复切换文件初始化阶段图文缩放不同步问题。
- 切换任意文件时预览缩放会重置为 100%。
- 每次切换文件都会重新初始化预览状态，即使文件类型相同也不复用上次设定。
- 修复 JSON/JSONC 深层嵌套数组对象内联键的定位映射，解决点击无响应与跳转行错位问题。

## 0.3.11 - 2026-05-05

- Reworked JSON/YAML/TOML/XML tree highlight behavior to follow editor selection lines and consistently resolve to a single continuous highlight range.
- Fixed YAML array-item locate mapping in nested container scenarios to avoid incorrect jumps into child nodes.
- Fixed JSON array-item locate mapping for inline arrays and nested arrays, eliminating wrong jumps and no-response clicks.
- Improved TOML array comment ownership so inline matrix and array-of-tables comments bind to the correct array element.
- Improved JSON/YAML/TOML/XML standalone comment placement at document tail to keep comments in the correct root-level scope.

～～～

- 重构 JSON/YAML/TOML/XML 树形高亮逻辑，使其以编辑器选中行为基准，并稳定收敛为单一连续高亮区域。
- 修复 YAML 在嵌套容器场景下的数组元素定位问题，避免跳转到子节点导致错位。
- 修复 JSON 在内联数组与嵌套数组场景下的数组元素定位问题，解决错跳和点击无响应。
- 优化 TOML 数组注释归属，使内联矩阵与 array-of-tables 注释绑定到正确数组元素。
- 优化 JSON/YAML/TOML/XML 文档尾部独立注释落位，确保注释保留在正确的根层作用域。

## 0.3.10 - 2026-04-29

- Fixed Markdown task-list styling so parent item state and style are no longer affected by checked child task items.
- Adjusted Markdown nested list indentation for ordered/unordered/task lists so child task checkboxes align with parent text.
- Reorganized localization resources: moved locale bundles under `locales/` and non-English README files to `docs/i18n/`, with references updated.
- Fixed JSON/YAML/TOML/XML tree highlight behavior for same-line parent-child nodes so TOML nested section selection highlights only the intended current node.
- Fixed XML attribute-node highlight behavior so selecting an `@` node highlights only its parent node.
- Enabled XML text-like keys (`#text`, `#cdata`) to participate in locate selection by mapping them to source lines, and expanded XML fixture coverage for special keys.
- Renamed provider source files for clarity: `markdownProvider.ts` -> `markdownPreviewProvider.ts`, `codePreviewProvider.ts` -> `datatreePreviewProvider.ts`.

～～～

- 修复 Markdown task list 样式：子级 task item 勾选状态不再影响父级 item 的状态与样式。
- 调整 Markdown 有序/无序/task 列表的嵌套缩进，使子级 task checkbox 与父级文本左对齐。
- 重组多语言资源：语言资源统一收敛到 `locales/`，非英文 README 移至 `docs/i18n/`，并同步更新引用。
- 修复 JSON/YAML/TOML/XML 树形高亮在同一行父子节点场景的联动问题，使 TOML 嵌套 section 仅高亮当前目标节点。
- 修复 XML `@` 属性节点的高亮联动问题，选中属性节点时仅高亮其父节点。
- 修复 XML 文本类键（`#text`、`#cdata`）的源码行映射，使其可参与定位/选中，并扩展 XML fixture 的特殊键覆盖。
- 按职责重命名 Provider 源文件：`markdownProvider.ts` -> `markdownPreviewProvider.ts`，`codePreviewProvider.ts` -> `datatreePreviewProvider.ts`。

---

## 0.3.9 - 2026-04-28

- Split webview styles into modular CSS files and switched to per-file-type style loading.
- CSV/TSV multi-cell copy action buttons now appear only when the preview panel is focused, and reappear on focus regain for existing selections.
- Markdown code-block copy and CSV/TSV multi-cell copy now keep `Copied` visible while hovered, then reset 800ms after pointer leave.

～～～

- 将 Webview 样式拆分为模块化 CSS 文件，并按文件类型按需加载样式。
- CSV/TSV 多单元格复制按钮仅在预览面板获得焦点时显示，已有选区在重新获得焦点后会自动恢复显示。
- Markdown 代码块复制与 CSV/TSV 多选复制在鼠标停留于 `Copied` 提示区域时保持显示，移出后 800ms 自动还原。

---

## 0.3.8 - 2026-04-28

- Added focus-aware selection colors for CSV/TSV cells and JSON/YAML/TOML/XML tree items (focused: blue, unfocused: gray).
- CSV/TSV multi-cell selection now shows actions with `Copy as ASCII` and `Copy as TSV`.
- CSV/TSV supports `Cmd/Ctrl+C` to copy the selected area.

～～～

- CSV/TSV 单元格与 JSON/YAML/TOML/XML 树节点新增焦点态高亮（获得焦点为蓝色，失焦为灰色）。
- CSV/TSV 多单元格选区新增操作菜单，支持 `复制为 ASCII` 和 `复制为 TSV`。
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
- Fixed Markdown locate behavior at document top by anchoring frontmatter table as `frontmatter`.
- Improved Mermaid precheck to support leading comments before the first diagram declaration.
- Added sticky first row and first column in CSV/TSV table preview.
- Fixed zoom behavior for data-tree comment popups so tooltip scale and anchor position stay aligned with comment icons.
- Fixed table preview container height calculation on zoom to prevent overflow.

～～～

- 统一项目文档与元数据一致性（README 版本徽章、多语言描述、架构说明、命名规范）。
- 强化 Webview 消息处理，新增 zoom/line 入参归一化与渲染 payload 结构防御校验。
- 修复 Markdown 在 fenced code block 场景下对 task 勾选行号映射与标题提取的干扰。
- 修复 Markdown 顶部定位场景，frontmatter 表格新增 `frontmatter` 锚点以保证稳定落位。
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
