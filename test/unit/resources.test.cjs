const {
  test,
  assert,
  fs,
  path,
  vm,
  DatatreePreviewProvider,
  TablePreviewProvider,
  MarkdownProvider,
  LatexPreviewProvider,
  MermaidPreviewProvider,
  supportsLocate,
  isDataTreeType,
  getFileType,
  RESOURCES_DIR,
  RESOURCES_CSS_DIR,
  RESOURCES_JS_DIR,
  readResourceCssBundle,
  extractKeyLines,
  assertLineContains,
  extractCommentPayloads,
  extractCommentOwners,
  extractCommentRenderEvents,
  getLabelEvent,
  buildLabelOwnerMap,
  getSingleLabelOwner,
  assertLabelOwner,
  assertSameOwner,
  readSupportedFixture,
} = require('./testUtils.cjs');

  test('CSV/TSV sticky styles use opaque frozen row and column backgrounds', () => {
    const css = readResourceCssBundle();

    assert.ok(css.includes('.table-preview-scroll'));
    assert.ok(/\.table-preview-scroll\s*\{[^}]*max-height:\s*[^;]+;/s.test(css));
    assert.ok(/\.table-preview-scroll\s*\{[^}]*--table-selection-[^:;]*safe-space:\s*[^;]+;/s.test(css));
    assert.ok(/\.table-preview-scroll\s*\{[^}]*padding-bottom:\s*var\(--table-selection-(?:[a-z-]*?)safe-space\);/s.test(css));
    assert.ok(/\.table-preview thead th\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;[^}]*background-color:\s*var\(--vscode-sideBar-background\);/s.test(css));
    assert.ok(/\.table-preview \.table-index-column\s*\{[^}]*position:\s*sticky;[^}]*left:\s*0;[^}]*background-color:\s*var\(--vscode-sideBar-background\);/s.test(css));
    assert.ok(/\.table-preview tbody tr:nth-child\(2n\) \.table-index-column\s*\{[^}]*background-color:\s*var\(--vscode-sideBar-background\);/s.test(css));
  });

  test('Task G zoom keeps tooltip and table viewport behavior stable', () => {
    const commonJsPath = path.join(RESOURCES_JS_DIR, 'common.js');
    const commonJs = fs.readFileSync(commonJsPath, 'utf8');
    const commentTooltipJsPath = path.join(RESOURCES_JS_DIR, 'comment-tooltip.js');
    const commentTooltipJs = fs.readFileSync(commentTooltipJsPath, 'utf8');

    assert.ok(commonJs.includes('const TABLE_PREVIEW_VIEWPORT_OFFSET_PX = 24;'));
    assert.ok(/function applyTablePreviewViewportHeight\(\)\s*\{[\s\S]*?\.table-preview-scroll[\s\S]*?maxHeight\s*=\s*`calc\(100vh \/ \$\{zoomScale\} - \$\{TABLE_PREVIEW_VIEWPORT_OFFSET_PX\}px\)`/s.test(commonJs));
    assert.ok(/function applyCommentTooltipZoom\(\)\s*\{[\s\S]*?commentTooltip\.style\.zoom\s*=\s*String\(getZoomScale\(\)\);/s.test(commentTooltipJs));
    assert.ok(/function applyZoom\(\)\s*\{[\s\S]*?applyTablePreviewViewportHeight\(\);[\s\S]*?applyCommentTooltipZoom\(\);[\s\S]*?positionCommentTooltip\(\);/s.test(commonJs));
    assert.ok(/function showCommentTooltip\(target\)\s*\{[\s\S]*?applyCommentTooltipZoom\(\);[\s\S]*?tooltip\.classList\.add\('is-visible'\);/s.test(commentTooltipJs));
  });

  test('Task A mermaid zoom uses x2 multiplier and keeps rerender zoom sync', () => {
    const commonJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'common.js'), 'utf8');
    const mermaidJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'mermaid.js'), 'utf8');

    assert.ok(mermaidJs.includes('function getMermaidZoomScale()'));
    assert.ok(mermaidJs.includes('return (zoomLevel / 100);'));
    assert.ok(mermaidJs.includes('const mermaidZoomScale = getMermaidZoomScale();'));
    assert.ok(mermaidJs.includes('const effectiveScale = mermaidZoomScale * fitScale;'));
    assert.ok(mermaidJs.includes('function clearMermaidSvgBaseSizeCache(svg)'));
    assert.ok(mermaidJs.includes('clearMermaidSvgBaseSizeCache(svg);'));
    assert.ok(mermaidJs.includes('function refreshMermaidZoomAfterRender()'));
    assert.ok(/function refreshMermaidZoomAfterRender\(\)\s*\{[\s\S]*?applyZoom\(\);[\s\S]*?requestAnimationFrame\(\(\) => \{[\s\S]*?applyZoom\(\);/s.test(mermaidJs));
  });

  test('Task D preview zoom resets to 100 when switching files', () => {
    const previewProvider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'previewProvider.ts'), 'utf8');

    assert.ok(previewProvider.includes('private _lastPreviewDocumentUri: string | null = null;'));
    assert.ok(previewProvider.includes('this._resetZoomForDocumentSwitch(document);'));
    assert.ok(previewProvider.includes('private _resetZoomForDocumentSwitch(document: vscode.TextDocument): void'));
    assert.ok(/private _resetZoomForDocumentSwitch\(document: vscode\.TextDocument\): void \{[\s\S]*?const nextDocumentUri = document\.uri\.toString\(\);[\s\S]*?if \(this\._lastPreviewDocumentUri === nextDocumentUri\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?this\._lastPreviewDocumentUri = nextDocumentUri;[\s\S]*?this\._zoomLevel = 100;[\s\S]*?type: 'zoom',[\s\S]*?level: this\._zoomLevel,/s.test(previewProvider));
    assert.ok(/private _showEmptyState\(\): void \{[\s\S]*?this\._lastPreviewDocumentUri = null;/s.test(previewProvider));
    assert.ok(/private _showError\(message: string\): void \{[\s\S]*?this\._lastPreviewDocumentUri = null;/s.test(previewProvider));
  });

  test('Task G table locate/scroll logic compensates sticky header and index column', () => {
    const tableJsPath = path.join(RESOURCES_JS_DIR, 'table.js');
    const tableJs = fs.readFileSync(tableJsPath, 'utf8');

    assert.ok(tableJs.includes('const TABLE_VISIBLE_LINE_PROBE_OFFSET_PX = 1;'));
    assert.ok(/function getFirstColumnAnchorCells\(table\)\s*\{[\s\S]*?querySelectorAll\('tbody tr'\)[\s\S]*?querySelector\('td\[data-start-line\]'\)/s.test(tableJs));
    assert.ok(/function scrollToLine\(line\)\s*\{[\s\S]*?const anchorCells = getFirstColumnAnchorCells\(table\);[\s\S]*?const stickyHeaderHeight = getStickyHeaderHeight\(table\);[\s\S]*?const stickyIndexColumnWidth = getStickyIndexColumnWidth\(table\);[\s\S]*?container\.scrollTop = Math\.max\(0, targetTop - stickyHeaderHeight\);[\s\S]*?container\.scrollLeft = Math\.max\(0, targetLeft - stickyIndexColumnWidth\);/s.test(tableJs));
    assert.ok(/function reportVisibleLine\(\)\s*\{[\s\S]*?const anchorCells = getFirstColumnAnchorCells\(table\);[\s\S]*?const probeTop = containerRect\.top \+ stickyHeaderHeight \+ TABLE_VISIBLE_LINE_PROBE_OFFSET_PX;[\s\S]*?Math\.abs\(rect\.top - probeTop\)/s.test(tableJs));
  });

  test('Task B Markdown Skeleton Outline distributes heading widths and uses a full-height hover TOC', () => {
    const css = readResourceCssBundle();
    const markdownJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'markdown.js'), 'utf8');
    const commonJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'common.js'), 'utf8');

    assert.ok(markdownJs.includes('function initMarkdownSkeletonOutline()'));
    assert.ok(markdownJs.includes('function buildMarkdownOutlineRankMap(headings)'));
    assert.ok(markdownJs.includes('const MARKDOWN_SKELETON_TOC_HIDE_DELAY_MS = 200;'));
    assert.ok(commonJs.includes('const maxScrollTop = Math.max(0, content.scrollHeight - content.clientHeight);'));
    assert.ok(commonJs.includes('const clampedScrollTop = Math.min(maxScrollTop, Math.max(0, targetScrollTop));'));
    assert.ok(commonJs.includes("content.scrollTo({ top: clampedScrollTop, behavior: 'instant' });"));
    assert.equal(commonJs.includes("element.scrollIntoView({ behavior: 'instant', block: 'start' });"), false);
    assert.ok(markdownJs.includes('const normalizedHeadingLevels = Array.from(new Set(headings.map(heading => heading.level))).sort((a, b) => a - b);'));
    assert.ok(markdownJs.includes('const MARKDOWN_SKELETON_LINE_BASE_WIDTH_PX = 2;'));
    assert.ok(markdownJs.includes('const MARKDOWN_SKELETON_LINE_MAX_WIDTH_PX = 20;'));
    assert.ok(markdownJs.includes('function resolveMarkdownSkeletonLineWidth(headingRank, headingLevelCount)'));
    assert.ok(markdownJs.includes('const averageWidth = distributableWidth / normalizedHeadingLevelCount;'));
    assert.ok(markdownJs.includes('normalizedHeadingRank * averageWidth / MARKDOWN_SKELETON_LINE_BASE_WIDTH_PX'));
    assert.ok(markdownJs.includes("line.dataset.headingRank = String(rank);"));
    assert.ok(markdownJs.includes('line.style.width = `${resolveMarkdownSkeletonLineWidth(rank, rankMap.size)}px`;'));
    assert.ok(markdownJs.includes("levelLabel.textContent = `H${heading.level}`;"));
    assert.ok(markdownJs.includes('item.style.marginLeft = `${rank * 20}px`;'));
    assert.ok(markdownJs.includes("content.className = 'markdown-skeleton-toc-item-content';"));
    assert.ok(markdownJs.includes('content.appendChild(levelLabel);'));
    assert.ok(markdownJs.includes('content.appendChild(title);'));
    assert.ok(markdownJs.includes('scrollToHeading(heading.id);'));
    assert.ok(markdownJs.includes("item.classList.toggle('is-active', item.getAttribute('data-heading-id') === activeHeadingId);"));
    assert.ok(markdownJs.includes('function showMarkdownSkeletonToc()'));
    assert.ok(markdownJs.includes("outline.classList.add('is-toc-open');"));
    assert.ok(markdownJs.includes('function scheduleMarkdownSkeletonTocHide()'));
    assert.ok(markdownJs.includes('}, MARKDOWN_SKELETON_TOC_HIDE_DELAY_MS);'));
    assert.ok(markdownJs.includes('initMarkdownSkeletonOutline();'));
    assert.ok(markdownJs.includes('cleanupMarkdownSkeletonOutline: cleanupMarkdownSkeletonOutline'));
    assert.ok(commonJs.includes('PreviewMarkdown.cleanupMarkdownSkeletonOutline'));

    assert.ok(/\.markdown-skeleton-outline\s*\{[^}]*position:\s*fixed;[^}]*top:\s*40px;[^}]*right:\s*0;[^}]*width:\s*20px;/s.test(css));
    assert.ok(/\.markdown-skeleton-lines\s*\{[^}]*width:\s*20px;/s.test(css));
    assert.ok(/\.markdown-skeleton-line\s*\{[^}]*max-width:\s*20px;/s.test(css));
    assert.ok(/\.markdown-skeleton-outline\.is-toc-open \.markdown-skeleton-lines\s*\{[^}]*visibility:\s*hidden;[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s.test(css));
    assert.ok(/\.markdown-skeleton-line:hover,\s*\.markdown-skeleton-line\.is-active\s*\{[^}]*background-color:\s*var\(--vscode-button-background\);/s.test(css));
    assert.ok(/\.markdown-skeleton-toc\s*\{[^}]*position:\s*fixed;[^}]*top:\s*0;[^}]*right:\s*0;[^}]*bottom:\s*0;[^}]*width:\s*240px;[^}]*max-width:\s*calc\(100vw - 20px\);/s.test(css));
    assert.ok(/\.markdown-skeleton-toc\s*\{[^}]*padding:\s*8px;[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;[^}]*background-color:\s*var\(--vscode-editorHoverWidget-background\);/s.test(css));
    assert.equal(/\.markdown-skeleton-toc\s*\{[^}]*border-left:/s.test(css), false);
    assert.ok(/\.markdown-skeleton-outline\.is-toc-open \.markdown-skeleton-toc/s.test(css));
    assert.ok(/\.markdown-skeleton-toc-item\s*\{[^}]*display:\s*block;[^}]*min-width:\s*0;[^}]*margin:\s*4px 0;[^}]*padding:\s*1px 6px 1px 6px;[^}]*background-color:\s*transparent;[^}]*line-height:\s*1\.3;/s.test(css));
    assert.equal(/\.markdown-skeleton-toc-item\s*\{[^}]*width:\s*100%;/s.test(css), false);
    assert.ok(/\.markdown-skeleton-toc-item-content\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*baseline;[^}]*gap:\s*4px;[^}]*padding:\s*0 4px;/s.test(css));
    assert.ok(/\.markdown-skeleton-toc-item:hover \.markdown-skeleton-toc-title,\s*\.markdown-skeleton-toc-item\.is-active \.markdown-skeleton-toc-title\s*\{[^}]*color:\s*var\(--vscode-textLink-foreground\);/s.test(css));
    assert.ok(/\.markdown-skeleton-toc-level\s*\{[^}]*color:\s*color-mix\(in srgb, var\(--vscode-descriptionForeground\) 50%, transparent 50%\);[^}]*font-size:\s*9px;/s.test(css));
    assert.ok(/\.markdown-skeleton-toc-title\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;/s.test(css));
  });

  test('2026-07-28 Task B calculates Skeleton Outline widths from actual heading levels', () => {
    const markdownJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'markdown.js'), 'utf8');
    const widthFunctionSource = markdownJs.slice(
      markdownJs.indexOf('function resolveMarkdownSkeletonLineWidth(headingRank, headingLevelCount)'),
      markdownJs.indexOf('function clearMarkdownSkeletonTocHideTimer()')
    );
    const context = {
      MARKDOWN_SKELETON_LINE_BASE_WIDTH_PX: 2,
      MARKDOWN_SKELETON_LINE_MAX_WIDTH_PX: 20,
    };

    vm.runInNewContext(
      `${widthFunctionSource}
      twoLevels = [
        resolveMarkdownSkeletonLineWidth(0, 2),
        resolveMarkdownSkeletonLineWidth(1, 2)
      ];
      threeLevels = [
        resolveMarkdownSkeletonLineWidth(0, 3),
        resolveMarkdownSkeletonLineWidth(1, 3),
        resolveMarkdownSkeletonLineWidth(2, 3)
      ];`,
      context
    );

    assert.deepEqual(Array.from(context.twoLevels), [20, 12]);
    assert.deepEqual(Array.from(context.threeLevels), [20, 14, 8]);
  });

  test('2026-07-28 Task B shows CSV and TSV group feedback after shortcut copy', () => {
    const tableJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'table.js'), 'utf8');
    const copyHandlerSource = tableJs.slice(
      tableJs.indexOf("document.addEventListener('copy', (e) => {"),
      tableJs.indexOf("PreviewCommon.registerDomainInit(['csv', 'tsv'], 'table'")
    );

    assert.ok(copyHandlerSource.includes("e.clipboardData.setData('text/plain', buildTsvText(grid));"));
    assert.ok(copyHandlerSource.includes('if (tableSelectionUi.tsvButton) {'));
    assert.ok(copyHandlerSource.includes('showTableCopySuccess(tableSelectionUi.tsvButton);'));
    assert.ok(
      copyHandlerSource.indexOf('showTableCopySuccess(tableSelectionUi.tsvButton);')
      > copyHandlerSource.indexOf("e.clipboardData.setData('text/plain', buildTsvText(grid));")
    );
  });

  test('Task A keeps Feedback out of every preview title bar', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
    const previewTitleCommands = packageJson.contributes.menus['view/title'];

    assert.equal(previewTitleCommands.some(item => item.command === 'sidebarPreviewer.feedback'), false);
  });

  test('Follow scroll state persists across extension activations', () => {
    const previewProvider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'previewProvider.ts'), 'utf8');

    assert.ok(previewProvider.includes("const FOLLOW_EDITOR_SCROLL_STATE_KEY = 'sidebarPreviewer.followEditorScroll';"));
    assert.ok(previewProvider.includes('this._followEditorScroll = _extensionContext.globalState.get<boolean>(FOLLOW_EDITOR_SCROLL_STATE_KEY, true);'));
    assert.ok(previewProvider.includes('void this._extensionContext.globalState.update(FOLLOW_EDITOR_SCROLL_STATE_KEY, enabled);'));
  });

  test('Task H table focus highlight and clipboard actions are wired with i18n labels', () => {
    const css = readResourceCssBundle();
    const tableJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'table.js'), 'utf8');
    const commonJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'common.js'), 'utf8');
    const previewProvider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'previewProvider.ts'), 'utf8');
    const i18n = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'i18n.ts'), 'utf8');
    assert.ok(/\.table-preview td\.selected\s*\{[\s\S]*?--vscode-list-inactiveSelectionBackground/s.test(css));
    assert.ok(/#content\.preview-focused \.table-preview td\.selected\s*\{[\s\S]*?color-mix\(in srgb, var\(--vscode-button-background\) 35%, transparent 65%\)/s.test(css));
    assert.ok(/\.table-preview th\.selected\s*\{[\s\S]*?--vscode-list-inactiveSelectionBackground/s.test(css));
    assert.ok(/#content\.preview-focused \.table-preview th\.selected\s*\{[\s\S]*?--vscode-list-activeSelectionBackground/s.test(css));
    assert.ok(/\.data-tree \.tree-item\.is-highlight[\s\S]*?--vscode-list-inactiveSelectionBackground/s.test(css));
    assert.ok(/#content\.preview-focused \.data-tree \.tree-item\.is-highlight/s.test(css));
    assert.ok(/\.table-selection-actions\s*\{[^}]*z-index:\s*1;/s.test(css));
    assert.equal(/\.table-selection-actions\s*\{[^}]*flex-direction:\s*column;/s.test(css), false);
    assert.ok(css.includes('.table-copy-button'));
    assert.ok(css.includes('.table-copy-menu-item'));
    assert.ok(/\.table-preview \.table-index-column\s*\{[^}]*z-index:\s*2;/s.test(css));
    assert.ok(/\.table-preview \.table-index-column\s*\{[^}]*user-select:\s*none;[^}]*-webkit-user-select:\s*none;/s.test(css));

    assert.ok(tableJs.includes('L10N_TEXT.tableSelectionMarkdown'));
    assert.ok(tableJs.includes('L10N_TEXT.tableSelectionAscii'));
    assert.ok(tableJs.includes('table-copy-button table-copy-main'));
    assert.ok(tableJs.includes('codicon-copy'));
    assert.ok(tableJs.includes(
      'function buildMarkdownTableText(headerRow, bodyGrid, alignments = [], preserveCellFormatting = false)'
    ));
    assert.ok(tableJs.includes('function buildAsciiTableText(grid)'));
    assert.ok(tableJs.includes('function buildSelectionCopySnapshot(selectedCells)'));
    assert.ok(tableJs.includes('function buildGridWithHeader(snapshot)'));
    assert.ok(tableJs.includes('function isFullWidthCodePoint(codePoint)'));
    assert.ok(tableJs.includes("const topBorder = buildAsciiBorder(widths, '┌', '┬', '┐');"));
    assert.ok(tableJs.includes('const TABLE_SELECTION_COPY_SUCCESS_MS = 800;'));
    assert.ok(tableJs.includes('function showTableCopySuccess(copyBtn)'));
    assert.ok(tableJs.includes('function resetTableCopySuccess(actions)'));
    assert.ok(tableJs.includes('function scheduleTableCopySuccessReset(actions)'));
    assert.ok(tableJs.includes('function isPreviewContentFocused()'));
    assert.ok(tableJs.includes('function bindTableSelectionFocusEvents()'));
    assert.equal(tableJs.includes('L10N_TEXT.copySuccess'), false);
    assert.equal(commonJs.includes('copySuccess'), false);
    assert.equal(tableJs.includes('TABLE_SELECTION_COPY_FADE_MS'), false);
    assert.equal(tableJs.includes('fade-out'), false);
    assert.ok(tableJs.includes('function bindTableCopyButton(copyButton, buildText)'));
    assert.equal(tableJs.includes('function updateTableCopySuccessHoverState(actions, isHovering)'), false);
    assert.ok(tableJs.includes("if (!isPreviewContentFocused() && !wrapper.classList.contains('copied')) {"));
    assert.ok(tableJs.includes("document.addEventListener('focusin', handleTableSelectionFocusChange);"));
    assert.ok(tableJs.includes("window.addEventListener('blur', handleTableSelectionFocusChange);"));
    assert.ok(tableJs.includes('bindTableSelectionFocusEvents();'));
    assert.ok(tableJs.includes('let left = bounds.right - containerRect.left + tableSelectionUi.container.scrollLeft'));
    assert.ok(tableJs.includes('let top = bounds.top - containerRect.top + tableSelectionUi.container.scrollTop + TABLE_SELECTION_ACTION_MARGIN_PX;'));
    assert.equal(tableJs.includes('table-selection-more-btn'), false);
    assert.equal(tableJs.includes('table-selection-menu-item'), false);
    assert.ok(tableJs.includes('selectedCells.length === 1'));
    assert.ok(tableJs.includes('buildTsvText(grid)'));

    assert.ok(commonJs.includes('function focusPreviewContent()'));
    assert.ok(commonJs.includes("content.classList.toggle('preview-focused', !!focused);"));
    assert.ok(commonJs.includes("const DATA_TREE_FILE_TYPES = new Set(['json', 'jsonl', 'yaml', 'toml', 'xml']);"));
    assert.ok(commonJs.includes("const NO_SELECT_ALL_FILE_TYPES = new Set(['csv', 'tsv', ...DATA_TREE_FILE_TYPES]);"));
    assert.ok(/document\.addEventListener\('keydown', \(e\) => \{[\s\S]*?e\.key\.toLowerCase\(\) !== 'a'[\s\S]*?NO_SELECT_ALL_FILE_TYPES\.has\(currentFileType\)[\s\S]*?e\.preventDefault\(\);[\s\S]*?e\.stopPropagation\(\);[\s\S]*?\}, true\);/s.test(commonJs));
    assert.ok(commonJs.includes("tableSelectionMore: L10N_SOURCE.tableSelectionMore || 'Actions'"));
    assert.ok(commonJs.includes("tableSelectionMarkdown: L10N_SOURCE.tableSelectionMarkdown || 'Copy as Markdown'"));
    assert.ok(commonJs.includes("tableSelectionAscii: L10N_SOURCE.tableSelectionAscii || 'Copy as ASCII'"));
    assert.ok(commonJs.includes("tableSelectionTsv: L10N_SOURCE.tableSelectionTsv || 'Copy as TSV'"));
    assert.ok(commonJs.includes("tableSelectionTsvHint: L10N_SOURCE.tableSelectionTsvHint || 'For Excel, Numbers & Sheets'"));
    assert.ok(commonJs.includes("tableSelectionCsv: L10N_SOURCE.tableSelectionCsv || 'Copy as CSV'"));

    assert.ok(previewProvider.includes('data-table-selection-more="${escapeHtml(i18n.tableSelectionMore)}"'));
    assert.ok(previewProvider.includes('data-table-selection-markdown="${escapeHtml(i18n.tableSelectionMarkdownTable)}"'));
    assert.ok(previewProvider.includes('data-table-selection-ascii="${escapeHtml(i18n.tableSelectionAsciiTable)}"'));
    assert.ok(previewProvider.includes('data-table-selection-tsv="${escapeHtml(i18n.tableSelectionTsv)}"'));
    assert.ok(previewProvider.includes('data-table-selection-tsv-hint="${escapeHtml(i18n.tableSelectionTsvHint)}"'));
    assert.ok(previewProvider.includes('data-table-selection-csv="${escapeHtml(i18n.tableSelectionCsv)}"'));
    assert.equal(previewProvider.includes('data-copy-success='), false);
    assert.equal(i18n.includes('copySuccess'), false);

    assert.ok(i18n.includes('tableSelectionMore'));
    assert.ok(i18n.includes('tableSelectionMarkdownTable'));
    assert.ok(i18n.includes('tableSelectionAsciiTable'));
    assert.ok(i18n.includes('tableSelectionTsv'));
    assert.ok(i18n.includes('tableSelectionTsvHint'));
    assert.ok(i18n.includes('tableSelectionCsv'));
    assert.ok(i18n.includes("tableSelectionMore: 'Actions'"));
    assert.ok(i18n.includes("tableSelectionMarkdownTable: 'Copy as Markdown'"));
    assert.ok(i18n.includes("tableSelectionAsciiTable: 'Copy as ASCII'"));
    assert.ok(i18n.includes("tableSelectionTsv: 'Copy as TSV'"));
    assert.ok(i18n.includes("tableSelectionTsvHint: 'For Excel, Numbers & Sheets'"));
    assert.ok(i18n.includes("tableSelectionCsv: 'Copy as CSV'"));
  });

  test('Task E table split actions use icon-only triggers, group feedback, and top-right selection placement', () => {
    const css = readResourceCssBundle();
    const tableJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'table.js'), 'utf8');
    const markdownActionsSource = tableJs.slice(
      tableJs.indexOf('function ensureMarkdownTableCopyActions(table)'),
      tableJs.indexOf('function bindMarkdownTableCopyActions()')
    );
    const selectionActionsSource = tableJs.slice(
      tableJs.indexOf('function ensureTableSelectionActionElements(table)'),
      tableJs.indexOf('function updateTableSelectionActions()')
    );
    const selectionPositionSource = tableJs.slice(
      tableJs.indexOf('function updateTableSelectionActions()'),
      tableJs.indexOf('function highlightTableRangeFunc(')
    );
    const copyMenuSource = tableJs.slice(
      tableJs.indexOf('function createTableCopyMenuElements()'),
      tableJs.indexOf('function bindTableCopyButton(copyButton, buildText)')
    );

    assert.ok(tableJs.includes('function buildMarkdownPreviewTableSnapshot(table)'));
    assert.ok(tableJs.includes("document.querySelectorAll('#content table:not(.frontmatter):not(.tabular-table)')"));
    assert.ok(tableJs.includes("wrapper.className = 'markdown-table-copy-wrapper';"));
    assert.ok(markdownActionsSource.includes("actions.className = 'markdown-table-copy-actions table-copy-actions';"));
    assert.ok(markdownActionsSource.includes("markdownButton.className = 'table-copy-button table-copy-main';"));
    assert.ok(markdownActionsSource.includes("markdownButton.innerHTML = '<i class=\"codicon codicon-copy\"></i>';"));
    assert.equal(/markdownButton\.innerHTML\s*=\s*[^;]*<span>/s.test(markdownActionsSource), false);
    assert.ok(markdownActionsSource.includes("dropdown.className = 'table-copy-dropdown';"));
    assert.ok(markdownActionsSource.includes("dropdownTrigger.className = 'table-copy-trigger';"));
    assert.ok(markdownActionsSource.includes("dropdownTrigger.innerHTML = '<i class=\"codicon codicon-chevron-down\"></i>';"));
    assert.equal(/dropdownTrigger\.innerHTML\s*=\s*[^;]*<span>/s.test(markdownActionsSource), false);
    assert.ok(markdownActionsSource.includes('const copyMenu = createTableCopyMenuElements();'));
    assert.ok(markdownActionsSource.includes('getMarkdownPreviewTableSource(table)'));
    assert.ok(markdownActionsSource.includes('return buildAsciiTableText(buildGridWithHeader(snapshot));'));
    assert.ok(markdownActionsSource.includes('return buildTsvText(buildGridWithHeader(snapshot));'));
    assert.ok(markdownActionsSource.includes('return buildCsvText(buildGridWithHeader(snapshot));'));
    assert.ok(tableJs.includes("PreviewCommon.registerDomainInit(['markdown'], 'markdown-table-copy'"));

    assert.ok(selectionActionsSource.includes("wrapper.className = 'table-selection-actions table-copy-actions';"));
    assert.ok(selectionActionsSource.includes("tsvButton.className = 'table-copy-button table-copy-main';"));
    assert.ok(selectionActionsSource.includes("tsvButton.innerHTML = '<i class=\"codicon codicon-copy\"></i>';"));
    assert.equal(/tsvButton\.innerHTML\s*=\s*[^;]*<span>/s.test(selectionActionsSource), false);
    assert.ok(selectionActionsSource.includes("dropdownTrigger.innerHTML = '<i class=\"codicon codicon-chevron-down\"></i>';"));
    assert.equal(/dropdownTrigger\.innerHTML\s*=\s*[^;]*<span>/s.test(selectionActionsSource), false);
    assert.ok(selectionActionsSource.includes('const copyMenu = createTableCopyMenuElements();'));
    assert.ok(selectionActionsSource.includes('return buildTsvText(buildGridWithHeader(snapshot));'));
    assert.ok(selectionActionsSource.includes('return buildAsciiTableText(buildGridWithHeader(snapshot));'));
    assert.ok(selectionActionsSource.includes('return buildMarkdownTableText(snapshot.headerRow, snapshot.bodyGrid);'));
    assert.ok(selectionActionsSource.includes('return buildCsvText(buildGridWithHeader(snapshot));'));
    assert.ok(/menu\.appendChild\(markdownButton\);\s*menu\.appendChild\(asciiButton\);\s*menu\.appendChild\(tsvButton\);\s*menu\.appendChild\(csvButton\);/s.test(copyMenuSource));
    assert.ok(tableJs.includes("feedback.className = 'table-copy-feedback';"));
    assert.ok(tableJs.includes("feedback.innerHTML = '<i class=\"codicon codicon-notebook-state-success\"></i>';"));
    assert.equal(tableJs.includes('<span>${L10N_TEXT.copySuccess}</span>'), false);
    assert.ok(tableJs.includes("actions.classList.add('copied');"));
    assert.ok(selectionPositionSource.includes('right: Number.NEGATIVE_INFINITY'));
    assert.ok(selectionPositionSource.includes('top: Number.POSITIVE_INFINITY'));
    assert.ok(selectionPositionSource.includes('let left = bounds.right - containerRect.left + tableSelectionUi.container.scrollLeft'));
    assert.ok(selectionPositionSource.includes('- wrapper.offsetWidth - TABLE_SELECTION_ACTION_MARGIN_PX;'));
    assert.ok(selectionPositionSource.includes('let top = bounds.top - containerRect.top + tableSelectionUi.container.scrollTop + TABLE_SELECTION_ACTION_MARGIN_PX;'));

    assert.ok(/\.markdown-table-copy-wrapper\s*\{[^}]*position:\s*relative;[^}]*max-width:\s*100%;/s.test(css));
    assert.ok(/\.markdown-table-copy-actions\s*\{[^}]*position:\s*absolute;[^}]*top:\s*8px;[^}]*right:\s*8px;[^}]*visibility:\s*hidden;/s.test(css));
    assert.ok(/\.markdown-table-copy-wrapper:hover \.markdown-table-copy-actions,[\s\S]*?visibility:\s*visible;[\s\S]*?pointer-events:\s*auto;/s.test(css));
    assert.ok(/\.table-copy-button,\s*\.table-copy-trigger,\s*\.table-copy-menu-item\s*\{[^}]*background-color:\s*var\(--vscode-button-secondaryBackground\);/s.test(css));
    assert.ok(/\.table-copy-main\s*\{[^}]*width:\s*28px;[^}]*padding:\s*0;/s.test(css));
    assert.ok(/\.table-copy-trigger\s*\{[^}]*width:\s*20px;[^}]*padding:\s*0;/s.test(css));
    assert.ok(/\.table-copy-dropdown\[open\] \.table-copy-menu\s*\{[^}]*display:\s*flex;/s.test(css));
    assert.ok(/\.table-copy-menu-description\s*\{[^}]*color:\s*var\(--vscode-descriptionForeground\);[^}]*font-size:\s*9px;/s.test(css));
    assert.ok(/\.table-copy-feedback\s*\{[^}]*display:\s*none;[^}]*width:\s*48px;[^}]*height:\s*28px;[^}]*padding:\s*0;[^}]*background-color:\s*var\(--vscode-notebookStatusSuccessIcon-foreground\);/s.test(css));
    assert.ok(/\.codicon-notebook-state-success::before\s*\{[^}]*content:\s*'\\eab2';/s.test(css));
    assert.ok(/\.table-copy-actions\.copied > \.table-copy-button,[\s\S]*?display:\s*none;/s.test(css));
    assert.ok(/\.table-copy-actions\.copied > \.table-copy-feedback\s*\{[^}]*display:\s*inline-flex;/s.test(css));
  });

  test('2026-07-28 Task A keeps copy dropdowns reachable and applies group feedback to CSV and TSV controls', () => {
    const tableJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'table.js'), 'utf8');
    const actionGroupSource = tableJs.slice(
      tableJs.indexOf('function bindTableCopyActionGroup(actions, dropdown)'),
      tableJs.indexOf('function ensureMarkdownTableCopyActions(table)')
    );
    const selectionActionsSource = tableJs.slice(
      tableJs.indexOf('function ensureTableSelectionActionElements(table)'),
      tableJs.indexOf('function updateTableSelectionActions()')
    );
    const copySuccessSource = tableJs.slice(
      tableJs.indexOf('function showTableCopySuccess(copyBtn)'),
      tableJs.indexOf('function ensureTableSelectionActionElements(table)')
    );

    assert.ok(tableJs.includes('const TABLE_COPY_DROPDOWN_HIDE_DELAY_MS = 200;'));
    assert.ok(actionGroupSource.includes('let dropdownHideTimer = null;'));
    assert.ok(actionGroupSource.includes('clearTimeout(dropdownHideTimer);'));
    assert.ok(actionGroupSource.includes('dropdownHideTimer = setTimeout(() => {'));
    assert.ok(actionGroupSource.includes("dropdown.removeAttribute('open');"));
    assert.ok(actionGroupSource.includes('}, TABLE_COPY_DROPDOWN_HIDE_DELAY_MS);'));

    assert.ok(selectionActionsSource.includes("wrapper.className = 'table-selection-actions table-copy-actions';"));
    assert.ok(selectionActionsSource.includes('bindTableCopyButton(tsvButton, () =>'));
    assert.ok(selectionActionsSource.includes('bindTableCopyButton(copyMenu.asciiButton, () =>'));
    assert.ok(selectionActionsSource.includes('bindTableCopyButton(copyMenu.markdownButton, () =>'));
    assert.ok(selectionActionsSource.includes('bindTableCopyActionGroup(wrapper, dropdown);'));
    assert.ok(copySuccessSource.includes("copyBtn.closest('.table-copy-actions')"));
    assert.ok(copySuccessSource.includes("actions.classList.add('copied');"));
  });

  test('2026-07-28 Task A keeps CSV and TSV copy feedback visible during clipboard focus changes', () => {
    const tableJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'table.js'), 'utf8');
    const updateSelectionActionsSource = tableJs.slice(
      tableJs.indexOf('function updateTableSelectionActions()'),
      tableJs.indexOf('function highlightTableRangeFunc(')
    );
    const classes = new Set(['table-selection-actions', 'table-copy-actions', 'copied']);
    const wrapper = {
      classList: {
        add(name) {
          classes.add(name);
        },
        contains(name) {
          return classes.has(name);
        },
      },
      offsetWidth: 72,
      style: {},
    };
    const container = {
      scrollLeft: 0,
      scrollTop: 0,
      getBoundingClientRect() {
        return { left: 0, top: 0 };
      },
    };
    const selectedCells = [
      {
        getBoundingClientRect() {
          return { right: 120, top: 20 };
        },
      },
      {
        getBoundingClientRect() {
          return { right: 180, top: 20 };
        },
      },
    ];
    let hideCount = 0;

    vm.runInNewContext(`${updateSelectionActionsSource}\nupdateTableSelectionActions();`, {
      document: {
        querySelector(selector) {
          return selector === '.tabular-table' ? {} : null;
        },
      },
      ensureTableSelectionActionElements() {},
      getSelectedCells() {
        return selectedCells;
      },
      isPreviewContentFocused() {
        return false;
      },
      hideTableSelectionActions() {
        hideCount += 1;
      },
      tableSelectionUi: {
        container,
        wrapper,
      },
      TABLE_SELECTION_ACTION_MARGIN_PX: 6,
    });

    assert.equal(hideCount, 0);
    assert.equal(classes.has('is-visible'), true);
    assert.equal(wrapper.style.left, '102px');
    assert.equal(wrapper.style.top, '26px');
  });

  test('2026-07-28 Task C keeps both table copy menus in the same format order', () => {
    const css = readResourceCssBundle();
    const tableJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'table.js'), 'utf8');
    const copyMenuSource = tableJs.slice(
      tableJs.indexOf('function createTableCopyMenuElements()'),
      tableJs.indexOf('function bindTableCopyButton(copyButton, buildText)')
    );
    const markdownActionsSource = tableJs.slice(
      tableJs.indexOf('function ensureMarkdownTableCopyActions(table)'),
      tableJs.indexOf('function bindMarkdownTableCopyActions()')
    );
    const selectionActionsSource = tableJs.slice(
      tableJs.indexOf('function ensureTableSelectionActionElements(table)'),
      tableJs.indexOf('function updateTableSelectionActions()')
    );

    assert.ok(copyMenuSource.includes('createTableCopyMenuButton(L10N_TEXT.tableSelectionMarkdown)'));
    assert.ok(copyMenuSource.includes('createTableCopyMenuButton(L10N_TEXT.tableSelectionAscii)'));
    assert.ok(copyMenuSource.includes('createTableCopyMenuButton(L10N_TEXT.tableSelectionTsv, L10N_TEXT.tableSelectionTsvHint)'));
    assert.ok(copyMenuSource.includes('createTableCopyMenuButton(L10N_TEXT.tableSelectionCsv)'));
    assert.ok(/menu\.appendChild\(markdownButton\);\s*menu\.appendChild\(asciiButton\);\s*menu\.appendChild\(tsvButton\);\s*menu\.appendChild\(csvButton\);/s.test(copyMenuSource));

    assert.ok(markdownActionsSource.includes("markdownButton.className = 'table-copy-button table-copy-main';"));
    assert.ok(markdownActionsSource.includes('const copyMenu = createTableCopyMenuElements();'));
    assert.ok(markdownActionsSource.includes('bindTableCopyButton(copyMenu.markdownButton, () =>'));
    assert.ok(markdownActionsSource.includes('bindTableCopyButton(copyMenu.asciiButton, () =>'));
    assert.ok(markdownActionsSource.includes('bindTableCopyButton(copyMenu.tsvButton, () =>'));
    assert.ok(markdownActionsSource.includes('bindTableCopyButton(copyMenu.csvButton, () =>'));

    assert.ok(selectionActionsSource.includes("tsvButton.className = 'table-copy-button table-copy-main';"));
    assert.ok(selectionActionsSource.includes('const copyMenu = createTableCopyMenuElements();'));
    assert.ok(selectionActionsSource.includes('bindTableCopyButton(copyMenu.markdownButton, () =>'));
    assert.ok(selectionActionsSource.includes('bindTableCopyButton(copyMenu.asciiButton, () =>'));
    assert.ok(selectionActionsSource.includes('bindTableCopyButton(copyMenu.tsvButton, () =>'));
    assert.ok(selectionActionsSource.includes('bindTableCopyButton(copyMenu.csvButton, () =>'));

    assert.ok(/\.table-copy-menu-item\.has-description\s*\{[^}]*min-height:\s*40px;/s.test(css));
    assert.ok(/\.table-copy-menu-text\s*\{[^}]*flex-direction:\s*column;[^}]*align-items:\s*flex-start;/s.test(css));
    assert.ok(/\.table-copy-menu-description\s*\{[^}]*color:\s*var\(--vscode-descriptionForeground\);[^}]*font-size:\s*9px;/s.test(css));
  });

  test('2026-07-28 Task C escapes copied CSV values and keeps locale keys synchronized', () => {
    const tableJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'table.js'), 'utf8');
    const csvFunctionsSource = tableJs.slice(
      tableJs.indexOf('function escapeCsvCell(value)'),
      tableJs.indexOf('function isCombiningMarkCodePoint(codePoint)')
    );
    const context = {};

    vm.runInNewContext(
      `${csvFunctionsSource}
      csvText = buildCsvText([
        ['Name', 'Note'],
        ['Ada', 'Hello, "world"'],
        ['Lin', 'line 1\\nline 2']
      ]);`,
      context
    );

    assert.equal(context.csvText, 'Name,Note\r\nAda,"Hello, ""world"""\r\nLin,"line 1\nline 2"');

    const localesDir = path.join(__dirname, '..', '..', 'locales');
    const localeFiles = fs.readdirSync(localesDir)
      .filter(fileName => /^nls(?:\..+)?\.json$/i.test(fileName))
      .sort();
    const bundles = localeFiles.map(fileName => {
      return JSON.parse(fs.readFileSync(path.join(localesDir, fileName), 'utf8'));
    });
    const baseBundle = JSON.parse(fs.readFileSync(path.join(localesDir, 'nls.json'), 'utf8'));
    const expectedKeys = Object.keys(baseBundle).sort();
    bundles.forEach(bundle => {
      assert.deepEqual(Object.keys(bundle).sort(), expectedKeys);
      assert.equal(typeof bundle['runtime.tableSelectionCsv'], 'string');
      assert.equal(typeof bundle['runtime.tableSelectionTsvHint'], 'string');
      assert.equal(typeof bundle['runtime.wrapCode'], 'string');
      assert.equal(typeof bundle['runtime.unwrapCode'], 'string');
      assert.equal('runtime.copySuccess' in bundle, false);
    });
    assert.equal(baseBundle['runtime.tableSelectionCsv'], 'Copy as CSV');
    assert.equal(baseBundle['runtime.tableSelectionTsvHint'], 'For Excel, Numbers & Sheets');
  });

  test('2026-07-28 Task D aligns copy icons with labels and softens the TSV hint', () => {
    const css = readResourceCssBundle();

    assert.ok(/\.table-copy-menu-item\.has-description\s*\{[^}]*align-items:\s*flex-start;/s.test(css));
    assert.ok(/\.table-copy-menu-item > \.codicon,\s*\.table-copy-menu-label\s*\{[^}]*line-height:\s*16px;/s.test(css));
    assert.ok(/\.table-copy-menu-text\s*\{[^}]*gap:\s*0;/s.test(css));
    assert.ok(/\.table-copy-menu-description\s*\{[^}]*margin-top:\s*4px;[^}]*opacity:\s*0\.65;/s.test(css));
  });

  test('Task H datatree highlight prefers XML array index and avoids root over-highlight', () => {
    const datatreeJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'datatree.js'), 'utf8');

    function createClassList() {
      const classes = new Set();
      return {
        add(name) {
          classes.add(name);
        },
        remove(name) {
          classes.delete(name);
        },
        contains(name) {
          return classes.has(name);
        },
      };
    }

    function createTreeItem(label, line, parentItem, kind = 'key') {
      const item = {
        classList: createClassList(),
        parentElement: parentItem
          ? {
              closest(selector) {
                return selector === '.tree-item' ? parentItem : null;
              },
              parentElement: parentItem.parentElement,
            }
          : null,
        descendants: new Set(),
        querySelector(selector) {
          if (selector.includes('.tree-key[data-line]') && this.anchorKind === 'key') {
            return this.anchorElement;
          }
          if (selector.includes('.tree-index[data-line]') && this.anchorKind === 'index') {
            return this.anchorElement;
          }
          return null;
        },
        contains(other) {
          return this.descendants.has(other);
        },
      };

      const anchorElement = {
        textContent: label,
        classList: createClassList(),
        addEventListener() {},
        getAttribute(name) {
          if (name === 'data-line') {
            return String(line);
          }
          return null;
        },
        closest(selector) {
          return selector === '.tree-item' ? item : null;
        },
      };
      anchorElement.classList.add(kind === 'index' ? 'tree-index' : 'tree-key');

      item.anchorKind = kind;
      item.anchorElement = anchorElement;
      return { item, anchorElement };
    }

    const tomlParent = createTreeItem('profile', 60, null);
    const tomlChild = createTreeItem('dev', 60, tomlParent.item);
    tomlParent.item.descendants.add(tomlChild.item);

    const xmlRoot = createTreeItem('catalog', 12, null);
    const xmlParent = createTreeItem('book', 12, xmlRoot.item);
    const xmlAttr = createTreeItem('@id', 12, xmlParent.item);
    xmlRoot.item.descendants.add(xmlParent.item);
    xmlRoot.item.descendants.add(xmlAttr.item);
    xmlParent.item.descendants.add(xmlAttr.item);

    const xmlTextRoot = createTreeItem('catalog', 21, null);
    const xmlTextParent = createTreeItem('meta:flag', 21, xmlTextRoot.item);
    const xmlTextIndex = createTreeItem('0', 21, xmlTextParent.item, 'index');
    const xmlTextAttr = createTreeItem('@name', 21, xmlTextIndex.item);
    const xmlTextValue = createTreeItem('#TEXT', 21, xmlTextIndex.item);
    xmlTextRoot.item.descendants.add(xmlTextParent.item);
    xmlTextRoot.item.descendants.add(xmlTextIndex.item);
    xmlTextRoot.item.descendants.add(xmlTextAttr.item);
    xmlTextRoot.item.descendants.add(xmlTextValue.item);
    xmlTextParent.item.descendants.add(xmlTextIndex.item);
    xmlTextParent.item.descendants.add(xmlTextAttr.item);
    xmlTextParent.item.descendants.add(xmlTextValue.item);
    xmlTextIndex.item.descendants.add(xmlTextAttr.item);
    xmlTextIndex.item.descendants.add(xmlTextValue.item);

    const xmlProductsRoot = createTreeItem('catalog', 34, null);
    const xmlProductsKey = createTreeItem('products', 34, xmlProductsRoot.item);
    xmlProductsRoot.item.descendants.add(xmlProductsKey.item);

    let activeAnchors = [tomlParent.anchorElement, tomlChild.anchorElement];
    let activeItems = [tomlParent.item, tomlChild.item];

    const documentMock = {
      querySelectorAll(selector) {
        if (
          selector === '.data-tree .tree-key[data-line]'
          || selector === '.data-tree .tree-key[data-line], .data-tree .tree-index[data-line]'
        ) {
          return activeAnchors;
        }
        if (selector === '.data-tree .tree-item.is-highlight') {
          return activeItems.filter(item => item.classList.contains('is-highlight'));
        }
        return [];
      },
      querySelector() {
        return null;
      },
    };

    const context = {
      window: {},
      document: documentMock,
      PreviewCommon: {
        registerDomainInit(_types, _domain, init) {
          init('xml', {
            selectionStartLine: null,
            selectionEndLine: null,
            editedLine: null,
          });
        },
      },
      PreviewCommentTooltip: undefined,
      VSCODE_API: {
        postMessage() {},
      },
    };

    vm.runInNewContext(datatreeJs, context);

    context.window.PreviewDatatree.highlightTreeRange(60, 60);
    assert.equal(tomlParent.item.classList.contains('is-highlight'), false);
    assert.equal(tomlChild.item.classList.contains('is-highlight'), true);

    activeAnchors = [xmlRoot.anchorElement, xmlParent.anchorElement, xmlAttr.anchorElement];
    activeItems = [xmlRoot.item, xmlParent.item, xmlAttr.item];
    context.window.PreviewDatatree.highlightTreeRange(12, 12);

    assert.equal(xmlRoot.item.classList.contains('is-highlight'), false);
    assert.equal(xmlParent.item.classList.contains('is-highlight'), true);
    assert.equal(xmlAttr.item.classList.contains('is-highlight'), false);

    activeAnchors = [xmlTextRoot.anchorElement, xmlTextParent.anchorElement, xmlTextIndex.anchorElement, xmlTextAttr.anchorElement, xmlTextValue.anchorElement];
    activeItems = [xmlTextRoot.item, xmlTextParent.item, xmlTextIndex.item, xmlTextAttr.item, xmlTextValue.item];
    context.window.PreviewDatatree.highlightTreeRange(21, 21);

    assert.equal(xmlTextRoot.item.classList.contains('is-highlight'), false);
    assert.equal(xmlTextParent.item.classList.contains('is-highlight'), false);
    assert.equal(xmlTextIndex.item.classList.contains('is-highlight'), true);
    assert.equal(xmlTextAttr.item.classList.contains('is-highlight'), false);
    assert.equal(xmlTextValue.item.classList.contains('is-highlight'), false);

    activeAnchors = [xmlTextAttr.anchorElement, xmlTextValue.anchorElement];
    activeItems = [xmlTextRoot.item, xmlTextParent.item, xmlTextIndex.item, xmlTextAttr.item, xmlTextValue.item];
    context.window.PreviewDatatree.highlightTreeRange(21, 21);

    assert.equal(xmlTextRoot.item.classList.contains('is-highlight'), false);
    assert.equal(xmlTextParent.item.classList.contains('is-highlight'), false);
    assert.equal(xmlTextIndex.item.classList.contains('is-highlight'), true);
    assert.equal(xmlTextAttr.item.classList.contains('is-highlight'), false);
    assert.equal(xmlTextValue.item.classList.contains('is-highlight'), false);

    activeAnchors = [xmlTextValue.anchorElement];
    activeItems = [xmlTextRoot.item, xmlTextParent.item, xmlTextIndex.item, xmlTextAttr.item, xmlTextValue.item];
    context.window.PreviewDatatree.highlightTreeRange(21, 21);

    assert.equal(xmlTextRoot.item.classList.contains('is-highlight'), false);
    assert.equal(xmlTextParent.item.classList.contains('is-highlight'), false);
    assert.equal(xmlTextIndex.item.classList.contains('is-highlight'), true);
    assert.equal(xmlTextAttr.item.classList.contains('is-highlight'), false);
    assert.equal(xmlTextValue.item.classList.contains('is-highlight'), false);

    activeAnchors = [xmlProductsKey.anchorElement];
    activeItems = [xmlProductsRoot.item, xmlProductsKey.item];
    context.window.PreviewDatatree.highlightTreeRange(34, 34);

    assert.equal(xmlProductsRoot.item.classList.contains('is-highlight'), false);
    assert.equal(xmlProductsKey.item.classList.contains('is-highlight'), true);
  });

  test('Task A datatree locator is normalized and disabled when no direct highlight exists', () => {
    const datatreeJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'datatree.js'), 'utf8');
    const previewProvider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'previewProvider.ts'), 'utf8');

    assert.ok(datatreeJs.includes('function normalizeLocatorExpression(locator)'));
    assert.ok(datatreeJs.includes("locator.replace(/[\\r\\n]+/g, '').trim()"));
    assert.equal(datatreeJs.includes("currentDataTreeFileType === 'json' || currentDataTreeFileType === 'yaml'"), false);
    assert.ok(datatreeJs.includes("normalized.startsWith('..')"));
    assert.ok(datatreeJs.includes("normalized = normalized.replace(/^\\.+/, '.');"));
    assert.equal(datatreeJs.includes('const fallbackAnchor = resolveFallbackAnchorByRange(anchors, range);'), false);
    assert.equal(datatreeJs.includes('const fallbackTarget = resolveFallbackHighlightTarget(fallbackAnchor);'), false);

    assert.ok(previewProvider.includes("const normalizedLocator = locator.replace(/[\\r\\n]+/g, '').trim();"));
    assert.ok(previewProvider.includes('await vscode.env.clipboard.writeText(normalizedLocator);'));
  });

  test('Task C copy success resets immediately without fade animations', () => {
    const css = readResourceCssBundle();
    const codeblockJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'codeblock.js'), 'utf8');

    assert.equal(css.includes('.copy-btn.fade-out'), false);
    assert.equal(css.includes('transition: opacity 0.15s, background-color 0.15s;'), false);

    assert.ok(codeblockJs.includes('const CODE_BLOCK_COPY_RESET_MS = 800;'));
    assert.ok(codeblockJs.includes('function scheduleCopyButtonReset()'));
    assert.ok(codeblockJs.includes('scheduleCopyButtonReset();'));
    assert.ok(codeblockJs.includes('}, CODE_BLOCK_COPY_RESET_MS);'));
    assert.ok(codeblockJs.includes('function updateCopyButtonHoverState(isHovering)'));
    assert.ok(codeblockJs.includes("copyBtn.addEventListener('mouseenter', () => {"));
    assert.ok(codeblockJs.includes("copyBtn.addEventListener('mouseleave', () => {"));
    assert.ok(codeblockJs.includes("updateCopyButtonHoverState(copyBtn.matches(':hover'));"));
    assert.ok(codeblockJs.includes("copyBtn.innerHTML = '<i class=\"codicon codicon-notebook-state-success\"></i>';"));
    assert.equal(codeblockJs.includes('L10N_TEXT.copySuccess'), false);
    assert.ok(/\.copy-btn\.copied\s*\{[^}]*width:\s*28px;[^}]*padding:\s*0;/s.test(css));
    assert.equal(css.includes('.copy-btn.copied .codicon'), false);
    assert.equal(codeblockJs.includes('fade-out'), false);
  });

  test('2026-08-14 code blocks toggle wrapping with icon-only action buttons', () => {
    const codeblockJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'codeblock.js'), 'utf8');
    const codeblockCss = fs.readFileSync(path.join(RESOURCES_CSS_DIR, 'codeblock.css'), 'utf8');
    const commonJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'common.js'), 'utf8');
    const previewProvider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'previewProvider.ts'), 'utf8');
    const i18n = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'i18n.ts'), 'utf8');
    const wrapFunctionSource = codeblockJs.slice(
      codeblockJs.indexOf('function addCodeWrapButton(wrapper)'),
      codeblockJs.indexOf('function addCopyButton(pre, wrapper)')
    );
    const listeners = {};
    const button = {
      className: '',
      title: '',
      innerHTML: '',
      attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      addEventListener(type, handler) {
        listeners[type] = handler;
      },
    };
    let isWrapped = false;
    const wrapper = {
      appendedButton: null,
      classList: {
        toggle(name) {
          assert.equal(name, 'is-code-wrapped');
          isWrapped = !isWrapped;
          return isWrapped;
        },
      },
      appendChild(child) {
        this.appendedButton = child;
      },
    };
    const context = {
      document: {
        createElement(tagName) {
          assert.equal(tagName, 'button');
          return button;
        },
      },
      L10N_TEXT: {
        wrapCode: 'Word Wrap',
        unwrapCode: 'No Word Wrap',
      },
      wrapper,
    };

    vm.runInNewContext(`${wrapFunctionSource}\naddCodeWrapButton(wrapper);`, context);

    assert.equal(wrapper.appendedButton, button);
    assert.equal(button.className, 'code-wrap-btn');
    assert.equal(button.title, 'Word Wrap');
    assert.equal(button.attributes['aria-label'], 'Word Wrap');
    assert.equal(button.innerHTML, '<i class="codicon codicon-word-wrap"></i>');

    listeners.click({ stopPropagation() {} });
    assert.equal(isWrapped, true);
    assert.equal(button.title, 'No Word Wrap');
    assert.equal(button.attributes['aria-label'], 'No Word Wrap');
    assert.equal(button.innerHTML, '<i class="codicon codicon-symbol-text"></i>');

    listeners.click({ stopPropagation() {} });
    assert.equal(isWrapped, false);
    assert.equal(button.title, 'Word Wrap');
    assert.equal(button.attributes['aria-label'], 'Word Wrap');
    assert.equal(button.innerHTML, '<i class="codicon codicon-word-wrap"></i>');

    assert.ok(codeblockJs.includes("function addCodeBlockButtons(fileType = 'markdown')"));
    assert.ok(codeblockJs.includes("if (fileType === 'markdown' && !wrapper.querySelector('.code-wrap-btn'))"));
    assert.ok(codeblockJs.includes('addCodeBlockButtons(fileType);'));
    assert.ok(/\.copy-btn,\s*\.code-wrap-btn\s*\{[^}]*min-width:\s*28px;[^}]*height:\s*28px;/s.test(codeblockCss));
    assert.ok(/\.code-wrap-btn\s*\{[^}]*right:\s*40px;[^}]*width:\s*28px;[^}]*padding:\s*0;/s.test(codeblockCss));
    assert.ok(/\.code-block-wrapper\.is-code-wrapped pre\s*\{[^}]*white-space:\s*pre-wrap;[^}]*overflow-wrap:\s*anywhere;/s.test(codeblockCss));
    assert.ok(commonJs.includes("wrapCode: L10N_SOURCE.wrapCode || 'Word Wrap'"));
    assert.ok(commonJs.includes("unwrapCode: L10N_SOURCE.unwrapCode || 'No Word Wrap'"));
    assert.ok(previewProvider.includes('data-wrap-code="${escapeHtml(i18n.wrapCode)}"'));
    assert.ok(previewProvider.includes('data-unwrap-code="${escapeHtml(i18n.unwrapCode)}"'));
    assert.ok(i18n.includes("wrapCode: 'runtime.wrapCode'"));
    assert.ok(i18n.includes("unwrapCode: 'runtime.unwrapCode'"));
  });

  test('2026-08-13 Task A aligns Markdown controls and formats front matter values', () => {
    const commonCss = fs.readFileSync(path.join(RESOURCES_CSS_DIR, 'common.css'), 'utf8');
    const codeblockCss = fs.readFileSync(path.join(RESOURCES_CSS_DIR, 'codeblock.css'), 'utf8');
    const markdownCss = fs.readFileSync(path.join(RESOURCES_CSS_DIR, 'markdown.css'), 'utf8');
    const tableCss = fs.readFileSync(path.join(RESOURCES_CSS_DIR, 'table.css'), 'utf8');

    assert.ok(/\.copy-btn,\s*\.code-wrap-btn\s*\{[^}]*background-color:\s*var\(--vscode-button-secondaryHoverBackground\);/s.test(codeblockCss));
    assert.ok(/\.copy-btn,\s*\.code-wrap-btn\s*\{[^}]*box-shadow:\s*0 2px 6px color-mix\(in srgb, #000 25%, transparent 75%\);/s.test(codeblockCss));
    assert.ok(/\.copy-btn,\s*\.code-wrap-btn\s*\{[^}]*z-index:\s*2;/s.test(codeblockCss));
    assert.ok(/\.copy-btn:hover,\s*\.copy-btn:active,\s*\.code-wrap-btn:hover,\s*\.code-wrap-btn:active\s*\{[^}]*background-color:\s*var\(--vscode-button-secondaryHoverBackground\);/s.test(codeblockCss));
    assert.ok(/\.table-copy-main\s*\{[^}]*box-shadow:\s*0 2px 6px color-mix\(in srgb, #000 25%, transparent 75%\);/s.test(commonCss));
    assert.ok(/\.markdown-table-copy-actions \.table-copy-button,\s*\.markdown-table-copy-actions \.table-copy-trigger\s*\{[^}]*background-color:\s*var\(--vscode-button-secondaryHoverBackground\);/s.test(markdownCss));
    assert.ok(/h1, h2, h3, h4, h5, h6\s*\{[^}]*color:\s*var\(--vscode-textLink-foreground\);/s.test(markdownCss));
    assert.ok(/\.markdown-skeleton-outline\s*\{[^}]*z-index:\s*3;/s.test(markdownCss));
    assert.ok(/table\.frontmatter \.fm-tags\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto;/s.test(tableCss));
    assert.ok(/table\.frontmatter \.fm-tag\s*\{[^}]*flex:\s*0 0 auto;[^}]*white-space:\s*nowrap;/s.test(tableCss));
    assert.ok(/table\.frontmatter \.fm-json\s*\{[^}]*overflow-x:\s*auto;[^}]*white-space:\s*pre;/s.test(tableCss));
  });

  test('2026-07-28 Task E keeps table copy success visible for the fixed delay', () => {
    const css = readResourceCssBundle();
    const tableJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'table.js'), 'utf8');
    const showCopySuccessSource = tableJs.slice(
      tableJs.indexOf('function showTableCopySuccess(copyBtn)'),
      tableJs.indexOf('function ensureTableSelectionActionElements(table)')
    );
    const actionGroupSource = tableJs.slice(
      tableJs.indexOf('function bindTableCopyActionGroup(actions, dropdown)'),
      tableJs.indexOf('function ensureMarkdownTableCopyActions(table)')
    );

    assert.ok(showCopySuccessSource.includes("actions.classList.add('copied');"));
    assert.ok(showCopySuccessSource.includes('scheduleTableCopySuccessReset(actions);'));
    assert.equal(showCopySuccessSource.includes("actions.matches(':hover')"), false);
    assert.equal(actionGroupSource.includes('updateTableCopySuccessHoverState'), false);
    assert.ok(/\.table-copy-actions\.copied\s*\{[^}]*visibility:\s*visible;[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s.test(css));
  });

  test('2026-07-28 Task G serializes interactive table checkbox state for plain-text formats', () => {
    const css = readResourceCssBundle();
    const tableJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'table.js'), 'utf8');
    const cellTextSource = tableJs.slice(
      tableJs.indexOf('function getCellPlainText(cell)'),
      tableJs.indexOf('function getSelectedCells()')
    );
    const snapshotSource = tableJs.slice(
      tableJs.indexOf('function buildMarkdownPreviewTableSnapshot(table)'),
      tableJs.indexOf('function buildGridWithHeader(snapshot)')
    );
    const copyFormatSource = tableJs.slice(
      tableJs.indexOf('function buildGridWithHeader(snapshot)'),
      tableJs.indexOf('async function writeTextToClipboard(text)')
    );
    const createCell = (text, checked) => ({
      textContent: text,
      querySelector(selector) {
        if (selector === '.table-empty-cell') {
          return null;
        }
        if (selector === '.table-task-checkbox' && typeof checked === 'boolean') {
          return { checked };
        }
        return null;
      },
    });
    const headerCells = [createCell('Task'), createCell('Done')];
    const rows = [
      [createCell('Login'), createCell('Hello', true)],
      [createCell('Search'), createCell('', false)],
    ].map(cells => ({
      querySelectorAll() {
        return cells;
      },
    }));
    const context = {
      table: {
        querySelectorAll(selector) {
          if (selector === 'thead th') {
            return headerCells;
          }
          if (selector === 'tbody tr') {
            return rows;
          }
          return [];
        },
      },
    };

    vm.runInNewContext(
      `${cellTextSource}
      ${snapshotSource}
      ${copyFormatSource}
      snapshot = buildMarkdownPreviewTableSnapshot(table);
      grid = buildGridWithHeader(snapshot);
      asciiText = buildAsciiTableText(grid);
      tsvText = buildTsvText(grid);
      csvText = buildCsvText(grid);`,
      context
    );

    assert.deepEqual(
      Array.from(context.snapshot.bodyGrid, row => Array.from(row)),
      [['Login', '- [x] Hello'], ['Search', '- [ ]']]
    );
    assert.ok(context.asciiText.includes('│ Login  │ - [x] Hello │'));
    assert.ok(context.asciiText.includes('│ Search │ - [ ]       │'));
    assert.equal(context.tsvText, 'Task\tDone\r\nLogin\t- [x] Hello\r\nSearch\t- [ ]');
    assert.equal(context.csvText, 'Task,Done\r\nLogin,- [x] Hello\r\nSearch,- [ ]');
    assert.ok(/\.table-task-checkbox\s*\{[^}]*cursor:\s*pointer;/s.test(css));
  });

  test('2026-07-28 Task H preserves cell-level Markdown source when copying', () => {
    const tableJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'table.js'), 'utf8');
    const sourceFunctions = tableJs.slice(
      tableJs.indexOf('function parseMarkdownTableSourceRow(line)'),
      tableJs.indexOf('function buildGridWithHeader(snapshot)')
    );
    const formattingFunctions = tableJs.slice(
      tableJs.indexOf('function isCombiningMarkCodePoint(codePoint)'),
      tableJs.indexOf('function buildAsciiBorder(widths, left, middle, right)')
    );
    const actionsSource = tableJs.slice(
      tableJs.indexOf('function ensureMarkdownTableCopyActions(table)'),
      tableJs.indexOf('function bindMarkdownTableCopyActions()')
    );
    const markdownSource = [
      '| Type | Content |',
      '| --- | --- |',
      '| Image | ![xxx](image.png) |',
      '| Task | - [ ] Hello |',
      '| HTML | <u>xxx</u> |',
      '| Escaped | a \\| b |',
    ].join('\n');
    const markdownTableData = JSON.stringify({
      source: markdownSource,
      alignments: [null, null],
    });
    const context = {
      table: {
        getAttribute(name) {
          return name === 'data-markdown-table' ? markdownTableData : null;
        },
      },
    };

    vm.runInNewContext(
      `${sourceFunctions}
      ${formattingFunctions}
      copiedMarkdown = getMarkdownPreviewTableSource(table);`,
      context
    );

    assert.ok(context.copiedMarkdown.includes('![xxx](image.png)'));
    assert.ok(context.copiedMarkdown.includes('- [ ] Hello'));
    assert.ok(context.copiedMarkdown.includes('<u>xxx</u>'));
    assert.ok(context.copiedMarkdown.includes('a \\| b'));
    assert.ok(actionsSource.includes(
      'bindTableCopyButton(markdownButton, () => getMarkdownPreviewTableSource(table));'
    ));
    assert.ok(actionsSource.includes(
      'bindTableCopyButton(copyMenu.markdownButton, () => getMarkdownPreviewTableSource(table));'
    ));
    assert.ok(actionsSource.includes('return buildAsciiTableText(buildGridWithHeader(snapshot));'));
    assert.ok(actionsSource.includes('return buildTsvText(buildGridWithHeader(snapshot));'));
    assert.ok(actionsSource.includes('return buildCsvText(buildGridWithHeader(snapshot));'));
  });

  test('2026-07-28 Task I standardizes Markdown table widths and alignment markers', () => {
    const tableJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'table.js'), 'utf8');
    const formattingFunctions = tableJs.slice(
      tableJs.indexOf('function isCombiningMarkCodePoint(codePoint)'),
      tableJs.indexOf('function buildAsciiBorder(widths, left, middle, right)')
    );
    const context = {};

    vm.runInNewContext(
      `${formattingFunctions}
      markdownText = buildMarkdownTableText(
        ['A', 'Mid', 'Done'],
        [['中文', '中', '9']],
        ['left', 'center', 'right'],
        true
      );`,
      context
    );

    assert.equal(
      context.markdownText,
      '| A    |  Mid  | Done |\n'
        + '| ---- | :---: | ---: |\n'
        + '| 中文 |  中   |    9 |'
    );
    assert.equal(context.markdownText.includes('|------|'), false);
    assert.equal(context.markdownText.includes(':--- |'), false);
  });

  test('2026-07-28 Task J does not append rows from trailing Markdown source lines', () => {
    const tableJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'table.js'), 'utf8');
    const sourceFunctions = tableJs.slice(
      tableJs.indexOf('function parseMarkdownTableSourceRow(line)'),
      tableJs.indexOf('function buildGridWithHeader(snapshot)')
    );
    const formattingFunctions = tableJs.slice(
      tableJs.indexOf('function isCombiningMarkCodePoint(codePoint)'),
      tableJs.indexOf('function buildAsciiBorder(widths, left, middle, right)')
    );
    const markdownTableData = JSON.stringify({
      source: '| A | B |\n| --- | --- |\n| 1 | 2 |\n\n',
      alignments: [null, null],
    });
    const context = {
      table: {
        getAttribute(name) {
          return name === 'data-markdown-table' ? markdownTableData : null;
        },
      },
    };

    vm.runInNewContext(
      `${sourceFunctions}
      ${formattingFunctions}
      copiedMarkdown = getMarkdownPreviewTableSource(table);`,
      context
    );

    assert.equal(
      context.copiedMarkdown,
      '| A   | B   |\n'
        + '| --- | --- |\n'
        + '| 1   | 2   |'
    );
  });

  test('Task C comment tooltip hover shows after delay while click remains immediate', () => {
    const commonJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'common.js'), 'utf8');
    const commentTooltipJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'comment-tooltip.js'), 'utf8');

    assert.ok(commonJs.includes('const COMMENT_TOOLTIP_SHOW_DELAY_MS = 400;'));
    assert.ok(commentTooltipJs.includes('function scheduleCommentTooltipShow(target, delayMs = COMMENT_TOOLTIP_SHOW_DELAY_MS)'));
    assert.ok(commentTooltipJs.includes('commentTooltipShowTimer = setTimeout(() => {'));
    assert.ok(commentTooltipJs.includes('scheduleCommentTooltipShow(icon);'));
    assert.ok(commentTooltipJs.includes("icon.addEventListener('click', (event) => {"));
    assert.ok(commentTooltipJs.includes('showCommentTooltip(icon);'));
  });

  test('Task F comment and global constant conventions are enforced', () => {
    const srcDir = path.join(__dirname, '..', '..', 'src');
    const tsFiles = fs.readdirSync(srcDir).filter(name => name.endsWith('.ts'));

    const placeholderPattern = /@param\s+input\s+-\s+无输入参数|@returns\s+返回处理结果|@returns\s+无返回值|@throws\s+\{Error\}\s+处理失败时抛出异常|@returns\s+返回结果|@param\s+\w+\s+-\s+\w+\s+参数/;
    for (const fileName of tsFiles) {
      const fileContent = fs.readFileSync(path.join(srcDir, fileName), 'utf8');
      assert.equal(placeholderPattern.test(fileContent), false, `${fileName} should not contain placeholder JSDoc tags`);
    }

    const commonJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'common.js'), 'utf8');
    const mermaidJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'mermaid.js'), 'utf8');
    const prepareVendor = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'prepare-vendor.mjs'), 'utf8');
    const fileTypes = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'fileTypes.ts'), 'utf8');
    const i18n = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'i18n.ts'), 'utf8');

    assert.ok(commonJs.includes('const VSCODE_API = acquireVsCodeApi();'));
    assert.ok(commonJs.includes('const L10N_TEXT = {'));
    assert.ok(commonJs.includes('const VALID_MESSAGE_TYPES = new Set(['));
    assert.ok(mermaidJs.includes('const MERMAID_DRAG_STATE = {'));
    assert.ok(/\/\*\*[\s\S]*?\*\/\s*function\s+escapeHtml\(/.test(commonJs));
    assert.ok(/\/\*\*[\s\S]*?\*\/\s*function\s+updateContent\(/.test(commonJs));

    assert.ok(prepareVendor.includes('const ROOT_PATH = path.resolve(__dirname,')); 
    assert.ok(prepareVendor.includes('const FILES_TO_COPY = ['));
    assert.ok(/\/\*\*[\s\S]*?\*\/\s*function\s+copyFile\(/.test(prepareVendor));

    assert.ok(fileTypes.includes('const FILE_TYPE_CAPABILITIES: Record<FileType, FileTypeCapabilities> = {'));
    assert.ok(fileTypes.includes('const EXTENSION_TO_TYPE_MAP: Map<string, FileType> = new Map('));

    assert.ok(i18n.includes('const SUPPORTED_EXTENSIONS = ['));
    assert.ok(i18n.includes('const SUPPORTED_LIST_HTML = SUPPORTED_EXTENSIONS.map('));
    assert.ok(i18n.includes("'JSONL (.jsonl)'"));
    assert.ok(i18n.includes('const RUNTIME_NLS_KEYS: { [K in keyof I18nStrings]: string } = {'));
    assert.ok(i18n.includes('const FALLBACK_STRINGS: I18nStrings = {'));
  });

  test('2026-07-28 Task K removes unused and inconsistent preview code', () => {
    const commonJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'common.js'), 'utf8');
    const markdownJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'markdown.js'), 'utf8');
    const markdownProvider = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'markdownPreviewProvider.ts'),
      'utf8'
    );
    const i18n = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'i18n.ts'), 'utf8');
    const tsconfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'tsconfig.json'), 'utf8'));

    assert.equal(i18n.includes('I18N_STRINGS'), false);
    assert.equal(i18n.includes('AVAILABLE_LOCALES'), false);
    assert.equal(i18n.includes('LOCALE_LOOKUP'), false);
    assert.equal(markdownProvider.includes('tokenizer(src: string, tokens: any)'), false);
    assert.equal((commonJs.match(/PreviewMermaid\.renderMermaid\(\)/g) || []).length, 2);
    assert.equal(
      (commonJs.match(/function scrollToHeading\(/g) || []).length
        + (markdownJs.match(/function scrollToHeading\(/g) || []).length,
      1
    );
    assert.equal(tsconfig.compilerOptions.noUnusedLocals, true);
    assert.equal(tsconfig.compilerOptions.noUnusedParameters, true);
  });

  test('2026-07-28 Task L writes Markdown table checkbox changes back to the exact marker', () => {
    const markdownJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'markdown.js'), 'utf8');
    const previewProvider = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'previewProvider.ts'),
      'utf8'
    );
    const checkboxBindingSource = markdownJs.slice(
      markdownJs.indexOf('function updateMarkdownTableCheckboxSource(checkbox)'),
      markdownJs.indexOf('// 向公共注册中心登记：仅在 Markdown 文件类型时激活')
    );
    const context = {
      checkboxHandler: null,
      postedMessage: null,
      document: {
        querySelectorAll(selector) {
          context.selector = selector;
          return [{
            addEventListener(type, handler) {
              assert.equal(type, 'change');
              context.checkboxHandler = handler;
            },
          }];
        },
      },
      VSCODE_API: {
        postMessage(message) {
          context.postedMessage = message;
        },
      },
    };

    vm.runInNewContext(`${checkboxBindingSource}\nbindCheckboxEvents();`, context);
    context.checkboxHandler({
      target: {
        checked: true,
        getAttribute(name) {
          return name === 'data-line' ? '12' : '27';
        },
      },
    });

    assert.ok(context.selector.includes('.table-task-checkbox[data-line][data-char]'));
    assert.deepEqual(
      { ...context.postedMessage },
      { type: 'toggleCheckbox', line: 12, char: 27, checked: true }
    );
    assert.ok(previewProvider.includes(
      'this._handleToggleCheckbox(message.line, message.checked, message.char);'
    ));
    assert.ok(previewProvider.includes('const marker = lineText.slice(character, character + 3);'));
    assert.ok(previewProvider.includes(
      'new vscode.Range(line, markerStart, line, markerStart + 3)'
    ));
  });

  test('2026-07-28 Task M keeps the preview stable after checkbox writeback', () => {
    const markdownJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'markdown.js'), 'utf8');
    const commonJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'common.js'), 'utf8');
    const previewProvider = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'previewProvider.ts'),
      'utf8'
    );
    const updateSource = markdownJs.slice(
      markdownJs.indexOf('function updateMarkdownTableCheckboxSource(checkbox)'),
      markdownJs.indexOf('function bindCheckboxEvents()')
    );
    let tableDataAttribute = JSON.stringify({
      source: '| Task | Done |\n| --- | --- |\n| Login | - [ ] |',
      alignments: [null, null],
    });
    const table = {
      getAttribute() {
        return tableDataAttribute;
      },
      setAttribute(name, value) {
        assert.equal(name, 'data-markdown-table');
        tableDataAttribute = value;
      },
    };
    const checkbox = {
      checked: true,
      closest() {
        return table;
      },
      getAttribute(name) {
        if (name === 'data-source-line') {
          return '2';
        }
        if (name === 'data-source-char') {
          return '12';
        }
        return null;
      },
    };
    const context = { checkbox };

    vm.runInNewContext(`${updateSource}\nupdateMarkdownTableCheckboxSource(checkbox);`, context);

    assert.equal(JSON.parse(tableDataAttribute).source.includes('| Login | - [x] |'), true);
    assert.ok(previewProvider.includes('private _skipNextPreviewUpdate: boolean = false;'));
    assert.ok(previewProvider.includes('if (this._consumeSkipNextPreviewUpdate()) {'));
    assert.ok(previewProvider.includes('this._skipNextPreviewUpdate = true;'));
    assert.equal(previewProvider.includes('preserveScrollPosition'), false);
    assert.equal(commonJs.includes('messageData.preserveScrollPosition'), false);
  });

  test('Supported JSONC fixture with mixed comment styles parses successfully', () => {
    const jsoncSource = readSupportedFixture('json.jsonc');
    const result = DatatreePreviewProvider.parse(jsoncSource, 'json');

    assert.equal(getFileType('fixture.jsonc'), 'json');
    assert.equal(result.fileType, 'json');
    assert.equal(result.supportsLocate, false);
    assert.equal(result.html.includes('Failed to parse JSON content.'), false);
    assert.ok(result.html.includes('commentStyles'));

    const payloads = extractCommentPayloads(result.html);

    assert.ok(payloads.some(payload => payload.some(item => item.marker === '/')));
    assert.ok(payloads.some(payload => payload.some(item => item.marker === '*')));
    assert.ok(payloads.some(payload => payload.some(item => /triple slash|bang-style|doc block|exclamation/.test(item.text))));
  });
