# Changelog

## 0.3.5 - 2026-04-24

### Added / 新增

> - Added XML sidebar preview support with JSON-like tree rendering.
> - Added CSV and TSV preview support as readable HTML tables.
> - Added richer regression tests for JSON/YAML/TOML/XML comment ownership and rendering scope.

> - 新增 XML 侧边栏预览，采用类 JSON 的树形结构展示。
> - 新增 CSV/TSV 预览，支持以 HTML 表格方式查看。
> - 新增更完整的回归测试，覆盖 JSON/YAML/TOML/XML 注释归属与渲染层级。

### Changed / 调整

> - Improved TOML key location strategy using path-aware mapping for nested tables.

> - TOML key 定位策略升级为路径感知映射，更适配嵌套 table 场景。

### Fixed / 修复

> - Fixed comment placement at nested scope vs document tail across JSON/YAML/TOML/XML.
> - Fixed JSON/JSONC array/object tail comment ownership.
> - Fixed TOML parent/child table order issue where parent locate/comment could be shadowed by earlier child table.

> - 修复 JSON/YAML/TOML/XML 在「嵌套作用域」和「文档末尾」的注释落位问题。
> - 修复 JSON/JSONC 数组与对象尾部注释归属。
> - 修复 TOML 父子 table 顺序问题，避免父节点被前置子节点错误抢占定位或注释。

### Notes / 说明

> - No breaking changes in this release.

> - 本次版本无破坏性变更。
