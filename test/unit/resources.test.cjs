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

  test('Task A/B Markdown Skeleton Outline is wired with relative heading levels and full-height hover TOC', () => {
    const css = readResourceCssBundle();
    const markdownJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'markdown.js'), 'utf8');
    const commonJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'common.js'), 'utf8');

    assert.ok(markdownJs.includes('function initMarkdownSkeletonOutline()'));
    assert.ok(markdownJs.includes('function buildMarkdownOutlineRankMap(headings)'));
    assert.ok(markdownJs.includes('const MARKDOWN_SKELETON_TOC_HIDE_DELAY_MS = 200;'));
    assert.ok(markdownJs.includes('const normalizedHeadingLevels = Array.from(new Set(headings.map(heading => heading.level))).sort((a, b) => a - b);'));
    assert.ok(markdownJs.includes('function resolveMarkdownSkeletonLineWidth(rank, rankCount)'));
    assert.ok(markdownJs.includes('return Math.max(4, Math.round(24 * (normalizedCount - rank) / normalizedCount));'));
    assert.ok(markdownJs.includes("line.dataset.headingRank = String(rank);"));
    assert.ok(markdownJs.includes('line.style.width = `${resolveMarkdownSkeletonLineWidth(rank, rankCount)}px`;'));
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

    assert.ok(/\.markdown-skeleton-outline\s*\{[^}]*position:\s*fixed;[^}]*top:\s*56px;[^}]*right:\s*8px;[^}]*width:\s*24px;/s.test(css));
    assert.ok(/\.markdown-skeleton-lines\s*\{[^}]*width:\s*24px;/s.test(css));
    assert.ok(/\.markdown-skeleton-outline\.is-toc-open \.markdown-skeleton-lines\s*\{[^}]*visibility:\s*hidden;[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/s.test(css));
    assert.ok(/\.markdown-skeleton-line:hover,\s*\.markdown-skeleton-line\.is-active\s*\{[^}]*background-color:\s*var\(--vscode-button-background\);/s.test(css));
    assert.ok(/\.markdown-skeleton-toc\s*\{[^}]*position:\s*fixed;[^}]*top:\s*0;[^}]*right:\s*0;[^}]*bottom:\s*0;[^}]*width:\s*240px;[^}]*max-width:\s*calc\(100vw - 24px\);/s.test(css));
    assert.ok(/\.markdown-skeleton-toc\s*\{[^}]*padding:\s*8px;[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;[^}]*background-color:\s*var\(--vscode-editorHoverWidget-background\);/s.test(css));
    assert.equal(/\.markdown-skeleton-toc\s*\{[^}]*border-left:/s.test(css), false);
    assert.ok(/\.markdown-skeleton-outline\.is-toc-open \.markdown-skeleton-toc/s.test(css));
    assert.ok(/\.markdown-skeleton-toc-item\s*\{[^}]*display:\s*block;[^}]*padding:\s*3px 8px 3px 8px;/s.test(css));
    assert.ok(/\.markdown-skeleton-toc-item-content\s*\{[^}]*display:\s*inline-flex;[^}]*gap:\s*4px;[^}]*padding:\s*0 4px;[^}]*border-radius:\s*4px;/s.test(css));
    assert.ok(/\.markdown-skeleton-toc-item:hover \.markdown-skeleton-toc-item-content,\s*\.markdown-skeleton-toc-item\.is-active \.markdown-skeleton-toc-item-content\s*\{[^}]*background-color:\s*var\(--vscode-list-hoverBackground\);/s.test(css));
    assert.ok(/\.markdown-skeleton-toc-level\s*\{[^}]*color:\s*color-mix\(in srgb, var\(--vscode-descriptionForeground\) 50%, transparent 50%\);[^}]*font-size:\s*9px;/s.test(css));
    assert.ok(/\.markdown-skeleton-toc-title\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s.test(css));
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
    assert.ok(css.includes('.table-selection-copy-btn'));
    assert.ok(/\.table-selection-actions\s*\{[^}]*z-index:\s*1;/s.test(css));
    assert.ok(/\.table-selection-actions\s*\{[^}]*flex-direction:\s*column;/s.test(css));
    assert.ok(/\.table-selection-copy-btn\s*\{[^}]*transition:\s*transform 80ms ease, box-shadow 120ms ease;/s.test(css));
    assert.ok(/\.table-selection-copy-btn:active\s*\{[^}]*transform:\s*translateY\(1px\);/s.test(css));
    assert.ok(/\.table-selection-copy-btn\.copied\s*\{[^}]*background-color:\s*var\(--vscode-notebookStatusSuccessIcon-foreground\);/s.test(css));
    assert.equal(css.includes('.table-selection-copy-btn.fade-out'), false);
    assert.ok(/\.table-preview \.table-index-column\s*\{[^}]*z-index:\s*2;/s.test(css));
    assert.ok(/\.table-preview \.table-index-column\s*\{[^}]*user-select:\s*none;[^}]*-webkit-user-select:\s*none;/s.test(css));

    assert.ok(tableJs.includes('L10N_TEXT.tableSelectionMarkdown'));
    assert.ok(tableJs.includes('L10N_TEXT.tableSelectionAscii'));
    assert.ok(tableJs.includes('table-selection-copy-btn'));
    assert.ok(tableJs.includes('codicon-copy'));
    assert.ok(tableJs.includes('function buildMarkdownTableText(headerRow, bodyGrid)'));
    assert.ok(tableJs.includes('function buildAsciiTableText(grid)'));
    assert.ok(tableJs.includes('function buildSelectionCopySnapshot(selectedCells)'));
    assert.ok(tableJs.includes('function buildGridWithHeader(snapshot)'));
    assert.ok(tableJs.includes('function isFullWidthCodePoint(codePoint)'));
    assert.ok(tableJs.includes("const topBorder = buildAsciiBorder(widths, '┌', '┬', '┐');"));
    assert.ok(tableJs.includes('const TABLE_SELECTION_COPY_SUCCESS_MS = 800;'));
    assert.ok(tableJs.includes('function showTableCopySuccess(copyBtn, defaultText)'));
    assert.ok(tableJs.includes('function lockTableSelectionCopyButtonSize(copyBtn)'));
    assert.ok(tableJs.includes('function resetTableSelectionCopyButton(copyBtn, defaultText)'));
    assert.ok(tableJs.includes('function scheduleTableCopyButtonReset(copyBtn, defaultText)'));
    assert.ok(tableJs.includes('function updateTableCopyButtonHoverState(copyBtn, isHovering, defaultText)'));
    assert.ok(tableJs.includes('function isPreviewContentFocused()'));
    assert.ok(tableJs.includes('function bindTableSelectionFocusEvents()'));
    assert.ok(tableJs.includes('L10N_TEXT.copySuccess'));
    assert.equal(tableJs.includes('TABLE_SELECTION_COPY_FADE_MS'), false);
    assert.equal(tableJs.includes('fade-out'), false);
    assert.ok(tableJs.includes("markdownButton.addEventListener('mouseenter', () => {"));
    assert.ok(tableJs.includes("markdownButton.addEventListener('mouseleave', () => {"));
    assert.ok(tableJs.includes("asciiButton.addEventListener('mouseenter', () => {"));
    assert.ok(tableJs.includes("asciiButton.addEventListener('mouseleave', () => {"));
    assert.equal(tableJs.includes("tsvButton.addEventListener('mouseenter', () => {"), false);
    assert.equal(tableJs.includes("tsvButton.addEventListener('mouseleave', () => {"), false);
    assert.equal(tableJs.includes("tsvButton.addEventListener('click', async (e) => {"), false);
    assert.ok(tableJs.includes("updateTableCopyButtonHoverState(copyBtn, copyBtn.matches(':hover'), defaultText);"));
    assert.ok(tableJs.includes('if (!isPreviewContentFocused()) {'));
    assert.ok(tableJs.includes("document.addEventListener('focusin', handleTableSelectionFocusChange);"));
    assert.ok(tableJs.includes("window.addEventListener('blur', handleTableSelectionFocusChange);"));
    assert.ok(tableJs.includes('bindTableSelectionFocusEvents();'));
    assert.ok(tableJs.includes('let left = bounds.left - containerRect.left + tableSelectionUi.container.scrollLeft;'));
    assert.ok(tableJs.includes('let top = bounds.bottom - containerRect.top + tableSelectionUi.container.scrollTop + TABLE_SELECTION_ACTION_MARGIN_PX;'));
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
    assert.ok(commonJs.includes("tableSelectionMarkdown: L10N_SOURCE.tableSelectionMarkdown || 'Copy as Markdown Table'"));
    assert.ok(commonJs.includes("tableSelectionAscii: L10N_SOURCE.tableSelectionAscii || 'Copy as ASCII Table'"));
    assert.ok(commonJs.includes("tableSelectionTsv: L10N_SOURCE.tableSelectionTsv || 'Copy as TSV'"));

    assert.ok(previewProvider.includes('data-table-selection-more="${escapeHtml(i18n.tableSelectionMore)}"'));
    assert.ok(previewProvider.includes('data-table-selection-markdown="${escapeHtml(i18n.tableSelectionMarkdownTable)}"'));
    assert.ok(previewProvider.includes('data-table-selection-ascii="${escapeHtml(i18n.tableSelectionAsciiTable)}"'));
    assert.ok(previewProvider.includes('data-table-selection-tsv="${escapeHtml(i18n.tableSelectionTsv)}"'));

    assert.ok(i18n.includes('tableSelectionMore'));
    assert.ok(i18n.includes('tableSelectionMarkdownTable'));
    assert.ok(i18n.includes('tableSelectionAsciiTable'));
    assert.ok(i18n.includes('tableSelectionTsv'));
    assert.ok(i18n.includes("tableSelectionMore: 'Actions'"));
    assert.ok(i18n.includes("tableSelectionMarkdownTable: 'Copy as Markdown Table'"));
    assert.ok(i18n.includes("tableSelectionAsciiTable: 'Copy as ASCII Table'"));
    assert.ok(i18n.includes("tableSelectionTsv: 'Copy as TSV'"));
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
    assert.equal(codeblockJs.includes('fade-out'), false);
  });

  test('Task E copy success remains while hovering and resets after leave', () => {
    const tableJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'table.js'), 'utf8');
    const codeblockJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'codeblock.js'), 'utf8');

    assert.ok(tableJs.includes('function updateTableCopyButtonHoverState(copyBtn, isHovering, defaultText)'));
    assert.ok(tableJs.includes('function scheduleTableCopyButtonReset(copyBtn, defaultText)'));
    assert.ok(tableJs.includes('if (isHovering) {'));

    assert.ok(codeblockJs.includes('function updateCopyButtonHoverState(isHovering)'));
    assert.ok(codeblockJs.includes("copyBtn.addEventListener('mouseenter', () => {"));
    assert.ok(codeblockJs.includes("copyBtn.addEventListener('mouseleave', () => {"));
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
    assert.ok(i18n.includes('const I18N_STRINGS: Record<string, I18nStrings> = {'));
    assert.ok(i18n.includes('const AVAILABLE_LOCALES = Object.keys(I18N_STRINGS) as LocaleKey[];'));
    assert.ok(i18n.includes('const LOCALE_LOOKUP = new Map<string, LocaleKey>('));
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
