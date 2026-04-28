const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { CodePreviewProvider } = require('../../out/codePreviewProvider');
const { TablePreviewProvider } = require('../../out/tablePreviewProvider');
const { MarkdownProvider } = require('../../out/markdownProvider');
const { LatexPreviewProvider } = require('../../out/latexPreviewProvider');
const { MermaidPreviewProvider } = require('../../out/mermaidPreviewProvider');
const { supportsLocate, isDataTreeType, getFileType } = require('../../out/fileTypes');

const RESOURCES_DIR = path.join(__dirname, '..', '..', 'resources');
const RESOURCES_CSS_DIR = path.join(RESOURCES_DIR, 'css');
const RESOURCES_JS_DIR = path.join(RESOURCES_DIR, 'js');

function readResourceCssBundle() {
  const cssFiles = fs.readdirSync(RESOURCES_CSS_DIR)
    .filter(name => name.endsWith('.css'))
    .sort();
  return cssFiles.map(fileName => fs.readFileSync(path.join(RESOURCES_CSS_DIR, fileName), 'utf8')).join('\n');
}

function escapeRegex(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractKeyLines(html, key) {
    const pattern = new RegExp(`<span class="tree-key" data-line="(\\d+)">${escapeRegex(key)}<\\/span>`, 'g');
    const lines = [];
    let match;

    while ((match = pattern.exec(html)) !== null) {
        lines.push(Number(match[1]));
    }

    return lines;
}

function assertLineContains(source, keyToken, line) {
    const lines = source.split('\n');
    assert.ok(line >= 0 && line < lines.length, `line ${line} should be within source bounds`);
    assert.ok(lines[line].includes(keyToken), `line ${line} should contain ${keyToken}`);
}

function decodeHtmlAttr(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#10;/g, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function extractCommentPayloads(html) {
  return Array.from(html.matchAll(/data-comments="([^"]+)"/g), match => {
    return JSON.parse(decodeHtmlAttr(match[1]));
  });
}

function extractCommentOwners(html) {
  const owners = [];
  let ownerId = 0;

  const keyPattern = /<span class="tree-key"[^>]*>([^<]*)<\/span><span class="tree-comment-icon[^>]*data-comments="([^"]+)"/g;
  const indexPattern = /<span class="tree-index"[^>]*>([^<]*)<\/span><span class="tree-comment-icon[^>]*data-comments="([^"]+)"/g;
  const standalonePattern = /<div class="tree-item tree-standalone-comment">\s*<span class="tree-comment-icon[^>]*data-comments="([^"]+)"/g;

  let match;
  while ((match = keyPattern.exec(html)) !== null) {
    owners.push({
      id: ownerId,
      kind: 'key',
      target: decodeHtmlAttr(match[1]),
      comments: JSON.parse(decodeHtmlAttr(match[2])),
    });
    ownerId += 1;
  }

  while ((match = indexPattern.exec(html)) !== null) {
    owners.push({
      id: ownerId,
      kind: 'index',
      target: decodeHtmlAttr(match[1]),
      comments: JSON.parse(decodeHtmlAttr(match[2])),
    });
    ownerId += 1;
  }

  while ((match = standalonePattern.exec(html)) !== null) {
    owners.push({
      id: ownerId,
      kind: 'standalone',
      target: 'standalone',
      comments: JSON.parse(decodeHtmlAttr(match[1])),
    });
    ownerId += 1;
  }

  return owners;
}

function extractCommentRenderEvents(html) {
  const decode = decodeHtmlAttr;
  const tokenPattern = /<[^>]+>|[^<]+/g;
  const tokens = html.match(tokenPattern) || [];
  const stack = [];
  let inSummary = false;
  let inStandaloneDiv = false;
  let spanKind = null;
  let spanText = '';
  let summaryOwner = null;
  const events = [];

  for (const token of tokens) {
    if (/^<details>$/i.test(token)) {
      stack.push({ label: null });
      continue;
    }

    if (/^<\/details>$/i.test(token)) {
      stack.pop();
      continue;
    }

    if (/^<summary>$/i.test(token)) {
      inSummary = true;
      summaryOwner = null;
      continue;
    }

    if (/^<\/summary>$/i.test(token)) {
      inSummary = false;
      continue;
    }

    if (/^<div class="tree-item tree-standalone-comment">$/i.test(token)) {
      inStandaloneDiv = true;
      continue;
    }

    if (inStandaloneDiv && /^<\/div>$/i.test(token)) {
      inStandaloneDiv = false;
      continue;
    }

    if (/^<span class="tree-key"/i.test(token)) {
      spanKind = 'key';
      spanText = '';
      continue;
    }

    if (/^<span class="tree-index"/i.test(token)) {
      spanKind = 'index';
      spanText = '';
      continue;
    }

    if (spanKind && !/^<[^>]+>$/.test(token)) {
      spanText += decode(token);
      continue;
    }

    if (spanKind && /^<\/span>$/i.test(token)) {
      const text = spanText;
      if (inSummary && stack.length > 0) {
        if (spanKind === 'key') {
          stack[stack.length - 1].label = text;
          summaryOwner = { kind: 'key', target: text };
        } else {
          stack[stack.length - 1].label = `[${text}]`;
          summaryOwner = { kind: 'index', target: text };
        }
      }
      spanKind = null;
      spanText = '';
      continue;
    }

    const iconMatch = token.match(/^<span class="tree-comment-icon[^>]*data-comments="([^"]+)"/i);
    if (!iconMatch) {
      continue;
    }

    const comments = JSON.parse(decode(iconMatch[1]));
    const path = stack.map(entry => entry.label).filter(Boolean).join(' > ');
    const owner = inStandaloneDiv
      ? { kind: 'standalone', target: 'standalone' }
      : (summaryOwner || { kind: 'unknown', target: 'unknown' });

    for (const comment of comments) {
      const match = /\[([A-Z])\]/.exec(comment.text);
      if (!match) {
        continue;
      }

      events.push({
        label: match[1],
        ownerKind: owner.kind,
        ownerTarget: owner.target,
        path,
      });
    }
  }

  return events;
}

function getLabelEvent(events, label) {
  const found = events.filter(event => event.label === label);
  assert.equal(found.length, 1, `label [${label}] should render exactly once`);
  return found[0];
}

function buildLabelOwnerMap(owners) {
  const labelOwners = new Map();

  for (const owner of owners) {
    for (const comment of owner.comments) {
      const match = /\[([A-Z])\]/.exec(comment.text);
      if (!match) {
        continue;
      }
      const label = match[1];
      const current = labelOwners.get(label) ?? [];
      current.push(owner);
      labelOwners.set(label, current);
    }
  }

  return labelOwners;
}

function getSingleLabelOwner(labelOwners, label) {
  const owners = labelOwners.get(label) ?? [];
  assert.equal(owners.length, 1, `label [${label}] should map to exactly one owner`);
  return owners[0];
}

function assertLabelOwner(labelOwners, label, expectedKind, expectedTarget) {
  const owner = getSingleLabelOwner(labelOwners, label);
  assert.equal(owner.kind, expectedKind, `label [${label}] should bind to ${expectedKind}`);
  assert.equal(owner.target, expectedTarget, `label [${label}] should bind to ${expectedTarget}`);
  return owner;
}

function assertSameOwner(labelOwners, labels) {
  const owners = labels.map(label => getSingleLabelOwner(labelOwners, label));
  const firstOwnerId = owners[0].id;
  owners.forEach((owner, index) => {
    assert.equal(owner.id, firstOwnerId, `labels ${labels[0]} and ${labels[index]} should share one popup entry`);
  });
  return owners[0];
}

function readSupportedFixture(name) {
    const filePath = path.join(__dirname, '..', 'supported-files', name);
    return fs.readFileSync(filePath, 'utf8');
}

test('JSON duplicate keys map to distinct source lines', () => {
    const source = `{
  "root": {
    "id": 1
  },
  "other": {
    "id": 2
  }
}`;

    const result = CodePreviewProvider.parse(source, 'json');
    const idLines = extractKeyLines(result.html, 'id');

    assert.deepEqual(idLines, [2, 5]);
    idLines.forEach(line => assertLineContains(source, '"id"', line));
});

test('YAML duplicate keys map in traversal order', () => {
    const source = `users:
  - name: Alice
    age: 20
  - name: Bob
meta:
  name: Team`;

    const result = CodePreviewProvider.parse(source, 'yaml');
    const nameLines = extractKeyLines(result.html, 'name');

    assert.deepEqual(nameLines, [1, 3, 5]);
    nameLines.forEach(line => assertLineContains(source, 'name', line));
});

test('TOML duplicate keys map to each section assignment line', () => {
    const source = `[server]
port = 8080
[client]
port = 3000`;

    const result = CodePreviewProvider.parse(source, 'toml');
    const portLines = extractKeyLines(result.html, 'port');

    assert.deepEqual(portLines, [1, 3]);
    portLines.forEach(line => assertLineContains(source, 'port', line));
});

test('Provider locate capabilities stay consistent with file type capabilities', () => {
    const latexResult = LatexPreviewProvider.parse('\\section{Intro}');
    const mermaidResult = MermaidPreviewProvider.parse('graph TD\nA-->B');
    const jsonResult = CodePreviewProvider.parse('{"k": 1}', 'json');
  const xmlResult = CodePreviewProvider.parse('<root><k>1</k></root>', 'xml');
  const csvResult = TablePreviewProvider.parse('name,age\nAlice,20', 'csv');

    assert.equal(latexResult.supportsLocate, supportsLocate('latex'));
    assert.equal(mermaidResult.supportsLocate, supportsLocate('mermaid'));
    assert.equal(jsonResult.supportsLocate, supportsLocate('json'));
  assert.equal(xmlResult.supportsLocate, supportsLocate('xml'));
  assert.equal(csvResult.supportsLocate, supportsLocate('csv'));

    assert.equal(isDataTreeType('json'), true);
    assert.equal(isDataTreeType('yaml'), true);
    assert.equal(isDataTreeType('toml'), true);
  assert.equal(isDataTreeType('xml'), true);
  assert.equal(isDataTreeType('csv'), false);
    assert.equal(isDataTreeType('markdown'), false);
    assert.equal(getFileType('settings.jsonc'), 'json');
  assert.equal(getFileType('report.xml'), 'xml');
  assert.equal(getFileType('dataset.csv'), 'csv');
  assert.equal(getFileType('dataset.tsv'), 'tsv');
});

test('MermaidPreviewProvider supports leading comments before diagram declaration', () => {
  const source = [
    '%% setup comment',
    '',
    'graph TD',
    'A-->B',
  ].join('\n');

  const result = MermaidPreviewProvider.parse(source);

  assert.equal(result.fileType, 'mermaid');
  assert.equal(result.supportsLocate, false);
  assert.ok(result.html.includes('<pre class="mermaid">'));
});

test('MermaidPreviewProvider validates first non-comment declaration line', () => {
  const source = [
    '%% setup comment',
    '',
    'invalidDiagramType',
  ].join('\n');

  assert.throws(
    () => MermaidPreviewProvider.parse(source),
    /Invalid Mermaid syntax: unrecognized diagram type/
  );
});

test('MarkdownProvider task checkbox line mapping ignores fenced code blocks', () => {
  const source = [
    '# Tasks',
    '',
    '```md',
    '- [ ] pseudo task in code block',
    '```',
    '- [x] real task',
    '- [ ] second real task',
  ].join('\n');

  const result = MarkdownProvider.parse(source);
  const lineMatches = Array.from(
    result.html.matchAll(/<input type="checkbox"(?: checked="")? data-line="(\d+)">/g),
    match => Number(match[1])
  );

  assert.deepEqual(lineMatches, [5, 6]);
});

test('CodePreviewProvider parses JSON comment-tolerant mode (comments and trailing commas)', () => {
    const source = `{
  "name": "Alice", // profile name
  "age": 20,
}`;
    const result = CodePreviewProvider.parse(source, 'json');

    assert.equal(result.fileType, 'json');
    assert.equal(result.supportsLocate, false);
    assert.ok(result.html.includes('<span class="tree-key" data-line="1">name</span>'));
    assert.equal(result.html.includes('Failed to parse JSON content.'), false);
});

test('Supported JSON/YAML/TOML fixtures parse successfully', () => {
    const jsonSource = readSupportedFixture('json.json');
    const yamlSource = readSupportedFixture('yaml.yaml');
    const tomlSource = readSupportedFixture('toml.toml');

    const jsonResult = CodePreviewProvider.parse(jsonSource, 'json');
    const yamlResult = CodePreviewProvider.parse(yamlSource, 'yaml');
    const tomlResult = CodePreviewProvider.parse(tomlSource, 'toml');

    assert.equal(jsonResult.fileType, 'json');
    assert.equal(yamlResult.fileType, 'yaml');
    assert.equal(tomlResult.fileType, 'toml');

    assert.equal(jsonResult.html.includes('Failed to parse JSON content.'), false);
    assert.equal(yamlResult.html.includes('Failed to parse YAML content.'), false);
    assert.equal(tomlResult.html.includes('Failed to parse TOML content.'), false);

    const jsonPayloads = extractCommentPayloads(jsonResult.html);
    const yamlPayloads = extractCommentPayloads(yamlResult.html);
    const tomlPayloads = extractCommentPayloads(tomlResult.html);

    assert.ok(Array.isArray(jsonPayloads));
    assert.ok(yamlPayloads.some(payload => payload.some(item => item.marker === '#')));
    assert.ok(tomlPayloads.some(payload => payload.some(item => item.marker === '#')));
  });

  test('Supported XML fixture parses successfully', () => {
    const xmlSource = readSupportedFixture('xml.xml');
    const result = CodePreviewProvider.parse(xmlSource, 'xml');

    assert.equal(result.fileType, 'xml');
    assert.equal(result.supportsLocate, false);
    assert.equal(result.html.includes('Failed to parse XML content.'), false);
    assert.ok(result.html.includes('catalog'));
    assert.ok(result.html.includes('@generatedAt'));
  });

  test('XML attributes are previewed as @-prefixed keys on the same object', () => {
    const source = '<book id="101" category="fiction"><title>The Great Gatsby</title></book>';
    const result = CodePreviewProvider.parse(source, 'xml');

    assert.equal(result.fileType, 'xml');
    assert.equal(result.html.includes('Failed to parse XML content.'), false);
    assert.ok(result.html.includes('@id'));
    assert.ok(result.html.includes('@category'));
    assert.ok(result.html.includes('title'));
    assert.ok(result.html.includes('"The Great Gatsby"'));
  });

  test('XML attributes are rendered before non-attribute keys', () => {
    const source = '<book id="101" category="fiction"><title>The Great Gatsby</title><author>Fitzgerald</author></book>';
    const result = CodePreviewProvider.parse(source, 'xml');

    const idPos = result.html.indexOf('>@id</span>');
    const categoryPos = result.html.indexOf('>@category</span>');
    const titlePos = result.html.indexOf('>title</span>');
    const authorPos = result.html.indexOf('>author</span>');

    assert.ok(idPos >= 0);
    assert.ok(categoryPos >= 0);
    assert.ok(titlePos >= 0);
    assert.ok(authorPos >= 0);
    assert.ok(idPos < titlePos);
    assert.ok(categoryPos < titlePos);
    assert.ok(idPos < authorPos);
    assert.ok(categoryPos < authorPos);
  });

  test('TablePreviewProvider parses CSV/TSV fixtures as HTML tables', () => {
    const csvSource = readSupportedFixture('csv.csv');
    const tsvSource = readSupportedFixture('tsv.tsv');

    const csvResult = TablePreviewProvider.parse(csvSource, 'csv');
    const tsvResult = TablePreviewProvider.parse(tsvSource, 'tsv');

    assert.equal(csvResult.fileType, 'csv');
    assert.equal(tsvResult.fileType, 'tsv');
    assert.equal(csvResult.supportsLocate, true);
    assert.equal(tsvResult.supportsLocate, true);

    assert.ok(csvResult.html.includes('<div class="table-preview-scroll">'));
    assert.ok(tsvResult.html.includes('<div class="table-preview-scroll">'));
    assert.ok(csvResult.html.includes('<table class="tabular-table">'));
    assert.ok(tsvResult.html.includes('<table class="tabular-table">'));
    assert.ok(csvResult.html.includes('Sample Item 1'));
    assert.ok(tsvResult.html.includes('svc-001'));
    assert.ok(csvResult.html.includes('table-index-column'));
    assert.ok(tsvResult.html.includes('table-index-column'));
    assert.equal(csvResult.html.includes('Failed to parse CSV content.'), false);
    assert.equal(tsvResult.html.includes('Failed to parse TSV content.'), false);
  });

  test('CSV/TSV sticky styles use opaque frozen row and column backgrounds', () => {
    const css = readResourceCssBundle();

    assert.ok(css.includes('.table-preview-scroll'));
    assert.ok(/\.table-preview-scroll\s*\{[^}]*max-height:\s*[^;]+;/s.test(css));
    assert.ok(/\.table-preview thead th\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;[^}]*background-color:\s*var\(--vscode-sideBar-background\);/s.test(css));
    assert.ok(/\.table-preview \.table-index-column\s*\{[^}]*position:\s*sticky;[^}]*left:\s*0;[^}]*background-color:\s*var\(--vscode-sideBar-background\);/s.test(css));
    assert.ok(/\.table-preview tbody tr:nth-child\(2n\) \.table-index-column\s*\{[^}]*background-color:\s*var\(--vscode-sideBar-background\);/s.test(css));
  });

  test('Task G zoom keeps tooltip and table viewport behavior stable', () => {
    const commonJsPath = path.join(RESOURCES_JS_DIR, 'preview-common.js');
    const commonJs = fs.readFileSync(commonJsPath, 'utf8');
    const commentTooltipJsPath = path.join(RESOURCES_JS_DIR, 'preview-comment-tooltip.js');
    const commentTooltipJs = fs.readFileSync(commentTooltipJsPath, 'utf8');

    assert.ok(commonJs.includes('const TABLE_PREVIEW_VIEWPORT_OFFSET_PX = 24;'));
    assert.ok(/function applyTablePreviewViewportHeight\(\)\s*\{[\s\S]*?\.table-preview-scroll[\s\S]*?maxHeight\s*=\s*`calc\(100vh \/ \$\{zoomScale\} - \$\{TABLE_PREVIEW_VIEWPORT_OFFSET_PX\}px\)`/s.test(commonJs));
    assert.ok(/function applyCommentTooltipZoom\(\)\s*\{[\s\S]*?commentTooltip\.style\.zoom\s*=\s*String\(getZoomScale\(\)\);/s.test(commentTooltipJs));
    assert.ok(/function applyZoom\(\)\s*\{[\s\S]*?applyTablePreviewViewportHeight\(\);[\s\S]*?applyCommentTooltipZoom\(\);[\s\S]*?positionCommentTooltip\(\);/s.test(commonJs));
    assert.ok(/function showCommentTooltip\(target\)\s*\{[\s\S]*?applyCommentTooltipZoom\(\);[\s\S]*?tooltip\.classList\.add\('is-visible'\);/s.test(commentTooltipJs));
  });

  test('Task G table locate/scroll logic compensates sticky header and index column', () => {
    const tableJsPath = path.join(RESOURCES_JS_DIR, 'preview-table.js');
    const tableJs = fs.readFileSync(tableJsPath, 'utf8');

    assert.ok(tableJs.includes('const TABLE_VISIBLE_LINE_PROBE_OFFSET_PX = 1;'));
    assert.ok(/function getFirstColumnAnchorCells\(table\)\s*\{[\s\S]*?querySelectorAll\('tbody tr'\)[\s\S]*?querySelector\('td\[data-start-line\]'\)/s.test(tableJs));
    assert.ok(/function scrollToLine\(line\)\s*\{[\s\S]*?const anchorCells = getFirstColumnAnchorCells\(table\);[\s\S]*?const stickyHeaderHeight = getStickyHeaderHeight\(table\);[\s\S]*?const stickyIndexColumnWidth = getStickyIndexColumnWidth\(table\);[\s\S]*?container\.scrollTop = Math\.max\(0, targetTop - stickyHeaderHeight\);[\s\S]*?container\.scrollLeft = Math\.max\(0, targetLeft - stickyIndexColumnWidth\);/s.test(tableJs));
    assert.ok(/function reportVisibleLine\(\)\s*\{[\s\S]*?const anchorCells = getFirstColumnAnchorCells\(table\);[\s\S]*?const probeTop = containerRect\.top \+ stickyHeaderHeight \+ TABLE_VISIBLE_LINE_PROBE_OFFSET_PX;[\s\S]*?Math\.abs\(rect\.top - probeTop\)/s.test(tableJs));
  });

  test('Task H table focus highlight and clipboard actions are wired with i18n labels', () => {
    const css = readResourceCssBundle();
    const tableJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'preview-table.js'), 'utf8');
    const commonJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'preview-common.js'), 'utf8');
    const previewProvider = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'previewProvider.ts'), 'utf8');
    const i18n = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'i18n.ts'), 'utf8');

    assert.ok(/\.table-preview td\.selected,[\s\S]*?\.table-preview th\.selected[\s\S]*?--vscode-list-inactiveSelectionBackground/s.test(css));
    assert.ok(/#content\.preview-focused \.table-preview td\.selected,[\s\S]*?#content\.preview-focused \.table-preview th\.selected/s.test(css));
    assert.ok(/\.data-tree \.tree-item\.is-highlight[\s\S]*?--vscode-list-inactiveSelectionBackground/s.test(css));
    assert.ok(/#content\.preview-focused \.data-tree \.tree-item\.is-highlight/s.test(css));
    assert.ok(css.includes('.table-selection-copy-btn'));
    assert.ok(/\.table-selection-actions\s*\{[^}]*z-index:\s*1;/s.test(css));
    assert.ok(/\.table-selection-copy-btn\s*\{[^}]*transition:\s*transform 80ms ease, box-shadow 120ms ease;/s.test(css));
    assert.ok(/\.table-selection-copy-btn:active\s*\{[^}]*transform:\s*translateY\(1px\);/s.test(css));
    assert.ok(/\.table-selection-copy-btn\.copied\s*\{[^}]*background-color:\s*var\(--vscode-notebookStatusSuccessIcon-foreground\);/s.test(css));
    assert.equal(css.includes('.table-selection-copy-btn.fade-out'), false);
    assert.ok(/\.table-preview \.table-index-column\s*\{[^}]*z-index:\s*2;/s.test(css));
    assert.ok(/\.table-preview \.table-index-column\s*\{[^}]*user-select:\s*none;[^}]*-webkit-user-select:\s*none;/s.test(css));

    assert.ok(tableJs.includes('L10N_TEXT.tableSelectionAscii'));
    assert.ok(tableJs.includes('L10N_TEXT.tableSelectionTsv'));
    assert.ok(tableJs.includes('table-selection-copy-btn'));
    assert.ok(tableJs.includes('codicon-copy'));
    assert.ok(tableJs.includes('function buildAsciiTableText(grid)'));
    assert.ok(tableJs.includes('const TABLE_SELECTION_COPY_SUCCESS_MS = 800;'));
    assert.ok(tableJs.includes('function showTableCopySuccess(copyBtn, defaultText)'));
    assert.ok(tableJs.includes('function lockTableSelectionCopyButtonSize(copyBtn)'));
    assert.ok(tableJs.includes('function resetTableSelectionCopyButton(copyBtn, defaultText)'));
    assert.ok(tableJs.includes('L10N_TEXT.copySuccess'));
    assert.equal(tableJs.includes('TABLE_SELECTION_COPY_FADE_MS'), false);
    assert.equal(tableJs.includes('fade-out'), false);
    assert.ok(tableJs.includes('let left = bounds.left - containerRect.left + tableSelectionUi.container.scrollLeft;'));
    assert.ok(tableJs.includes('let top = bounds.bottom - containerRect.top + tableSelectionUi.container.scrollTop + TABLE_SELECTION_ACTION_MARGIN_PX;'));
    assert.equal(tableJs.includes('table-selection-more-btn'), false);
    assert.equal(tableJs.includes('table-selection-menu-item'), false);
    assert.ok(tableJs.includes('selectedCells.length === 1'));
    assert.ok(tableJs.includes('buildTsvText(grid)'));

    assert.ok(commonJs.includes('function focusPreviewContent()'));
    assert.ok(commonJs.includes("content.classList.toggle('preview-focused', !!focused);"));
    assert.ok(commonJs.includes("const NO_SELECT_ALL_FILE_TYPES = new Set(['csv', 'tsv', 'json', 'yaml', 'toml', 'xml']);"));
    assert.ok(/document\.addEventListener\('keydown', \(e\) => \{[\s\S]*?e\.key\.toLowerCase\(\) !== 'a'[\s\S]*?NO_SELECT_ALL_FILE_TYPES\.has\(currentFileType\)[\s\S]*?e\.preventDefault\(\);[\s\S]*?e\.stopPropagation\(\);[\s\S]*?\}, true\);/s.test(commonJs));
    assert.ok(commonJs.includes("tableSelectionMore: L10N_SOURCE.tableSelectionMore || 'Actions'"));
    assert.ok(commonJs.includes("tableSelectionAscii: L10N_SOURCE.tableSelectionAscii || 'Copy As ASCII'"));
    assert.ok(commonJs.includes("tableSelectionTsv: L10N_SOURCE.tableSelectionTsv || 'Copy As TSV'"));

    assert.ok(previewProvider.includes('data-table-selection-more="${escapeHtml(i18n.tableSelectionMore)}"'));
    assert.ok(previewProvider.includes('data-table-selection-ascii="${escapeHtml(i18n.tableSelectionAsciiTable)}"'));
    assert.ok(previewProvider.includes('data-table-selection-tsv="${escapeHtml(i18n.tableSelectionTsv)}"'));

    assert.ok(i18n.includes('tableSelectionMore'));
    assert.ok(i18n.includes('tableSelectionAsciiTable'));
    assert.ok(i18n.includes('tableSelectionTsv'));
    assert.ok(i18n.includes("tableSelectionMore: 'Actions'"));
    assert.ok(i18n.includes("tableSelectionAsciiTable: 'Copy As ASCII'"));
    assert.ok(i18n.includes("tableSelectionTsv: 'Copy As TSV'"));
  });

  test('Task C copy success resets immediately without fade animations', () => {
    const css = readResourceCssBundle();
    const codeblockJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'preview-codeblock.js'), 'utf8');

    assert.equal(css.includes('.copy-btn.fade-out'), false);
    assert.equal(css.includes('transition: opacity 0.15s, background-color 0.15s;'), false);

    assert.ok(codeblockJs.includes('const CODE_BLOCK_COPY_RESET_MS = 800;'));
    assert.ok(codeblockJs.includes('function scheduleCopyButtonReset()'));
    assert.ok(codeblockJs.includes('scheduleCopyButtonReset();'));
    assert.ok(codeblockJs.includes('}, CODE_BLOCK_COPY_RESET_MS);'));
    assert.equal(codeblockJs.includes("copyBtn.addEventListener('mouseleave'"), false);
    assert.equal(codeblockJs.includes('fade-out'), false);
  });

  test('Task F comment and global constant conventions are enforced', () => {
    const srcDir = path.join(__dirname, '..', '..', 'src');
    const tsFiles = fs.readdirSync(srcDir).filter(name => name.endsWith('.ts'));

    const placeholderPattern = /@param\s+input\s+-\s+无输入参数|@returns\s+返回处理结果|@returns\s+无返回值|@throws\s+\{Error\}\s+处理失败时抛出异常|@returns\s+返回结果|@param\s+\w+\s+-\s+\w+\s+参数/;
    for (const fileName of tsFiles) {
      const fileContent = fs.readFileSync(path.join(srcDir, fileName), 'utf8');
      assert.equal(placeholderPattern.test(fileContent), false, `${fileName} should not contain placeholder JSDoc tags`);
    }

    const commonJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'preview-common.js'), 'utf8');
    const mermaidJs = fs.readFileSync(path.join(RESOURCES_JS_DIR, 'preview-mermaid.js'), 'utf8');
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
    assert.ok(i18n.includes('const I18N_STRINGS: Record<string, I18nStrings> = {'));
    assert.ok(i18n.includes('const AVAILABLE_LOCALES = Object.keys(I18N_STRINGS) as LocaleKey[];'));
    assert.ok(i18n.includes('const LOCALE_LOOKUP = new Map<string, LocaleKey>('));
  });

  test('Supported JSONC fixture with mixed comment styles parses successfully', () => {
    const jsoncSource = readSupportedFixture('json.jsonc');
    const result = CodePreviewProvider.parse(jsoncSource, 'json');

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

test('CodePreviewProvider returns an error state for invalid JSON', () => {
    const result = CodePreviewProvider.parse('{"k":', 'json');

    assert.equal(result.fileType, 'json');
    assert.equal(result.supportsLocate, false);
    assert.ok(result.html.includes('Failed to parse JSON content.'));
});

test('Comment icon metadata is rendered for JSON/YAML/TOML/XML keys', () => {
    const json = CodePreviewProvider.parse('{\n  "name": "Alice", // profile name\n}', 'json');
    const yaml = CodePreviewProvider.parse('name: Alice # full name', 'yaml');
    const toml = CodePreviewProvider.parse('name = "Alice" # display name', 'toml');
  const xml = CodePreviewProvider.parse('<root>\n  <!-- profile name -->\n  <name>Alice</name>\n</root>', 'xml');

    assert.ok(json.html.includes('tree-comment-icon codicon codicon-note'));
  assert.equal(json.html.includes('data-comment='), false);
  assert.ok(extractCommentPayloads(json.html).some(payload => payload.length === 1 && payload[0].marker === '/' && payload[0].text === 'profile name'));

    assert.ok(yaml.html.includes('tree-comment-icon codicon codicon-note'));
  assert.ok(extractCommentPayloads(yaml.html).some(payload => payload.length === 1 && payload[0].marker === '#' && payload[0].text === 'full name'));

    assert.ok(toml.html.includes('tree-comment-icon codicon codicon-note'));
  assert.ok(extractCommentPayloads(toml.html).some(payload => payload.length === 1 && payload[0].marker === '#' && payload[0].text === 'display name'));

    assert.ok(xml.html.includes('tree-comment-icon codicon codicon-note'));
  assert.ok(extractCommentPayloads(xml.html).some(payload => payload.some(item => item.marker === '-' && item.text === 'profile name')));
});

test('XML comment groups use hyphen marker in popup payload', () => {
  const source = [
    '<catalog>',
    '  <!-- list heading -->',
    '  <items><!-- inline marker --><item id="A" /></items>',
    '  <!-- multi-line',
    '       xml comment -->',
    '  <summary total="1" />',
    '</catalog>',
  ].join('\n');

  const result = CodePreviewProvider.parse(source, 'xml');
  const payloads = extractCommentPayloads(result.html);

  assert.ok(payloads.some(payload => payload.some(item => item.marker === '-' && item.text === 'list heading')));
  assert.ok(payloads.some(payload => payload.some(item => item.marker === '-' && item.text === 'inline marker')));
  assert.ok(payloads.some(payload => payload.some(item => item.marker === '-' && item.text === 'multi-line\nxml comment')));
});

test('XML comments follow node keys but not @ attributes', () => {
  const source = [
    '<!-- book node comment -->',
    '<book id="101" category="fiction"><title>The Great Gatsby</title></book>',
  ].join('\n');

  const result = CodePreviewProvider.parse(source, 'xml');

  assert.ok(/<span class="tree-key" data-line="\d+">book<\/span><span class="tree-comment-icon codicon codicon-note"/.test(result.html));
  assert.equal(/<span class="tree-key" data-line="\d+">@id<\/span><span class="tree-comment-icon codicon codicon-note"/.test(result.html), false);
  assert.equal(/<span class="tree-key" data-line="\d+">@category<\/span><span class="tree-comment-icon codicon codicon-note"/.test(result.html), false);
});

test('Document-end comments become outermost standalone comments for JSON/YAML/TOML/XML', () => {
  const jsonSource = [
    '{',
    '  "name": "Alice"',
    '}',
    '// root tail comment',
  ].join('\n');
  const yamlSource = [
    'name: Alice',
    '# root tail comment',
  ].join('\n');
  const tomlSource = [
    'name = "Alice"',
    '# root tail comment',
  ].join('\n');
  const xmlSource = [
    '<root><name>Alice</name></root>',
    '<!-- root tail comment -->',
  ].join('\n');

  const jsonResult = CodePreviewProvider.parse(jsonSource, 'json');
  const yamlResult = CodePreviewProvider.parse(yamlSource, 'yaml');
  const tomlResult = CodePreviewProvider.parse(tomlSource, 'toml');
  const xmlResult = CodePreviewProvider.parse(xmlSource, 'xml');

  const jsonPayloads = extractCommentPayloads(jsonResult.html);
  const yamlPayloads = extractCommentPayloads(yamlResult.html);
  const tomlPayloads = extractCommentPayloads(tomlResult.html);
  const xmlPayloads = extractCommentPayloads(xmlResult.html);

  assert.ok(jsonResult.html.includes('tree-standalone-comment'));
  assert.ok(yamlResult.html.includes('tree-standalone-comment'));
  assert.ok(tomlResult.html.includes('tree-standalone-comment'));
  assert.ok(xmlResult.html.includes('tree-standalone-comment'));

  assert.ok(jsonPayloads.some(payload => payload.some(item => item.marker === '/' && item.text === 'root tail comment')));
  assert.ok(yamlPayloads.some(payload => payload.some(item => item.marker === '#' && item.text === 'root tail comment')));
  assert.ok(tomlPayloads.some(payload => payload.some(item => item.marker === '#' && item.text === 'root tail comment')));
  assert.ok(xmlPayloads.some(payload => payload.some(item => item.marker === '-' && item.text === 'root tail comment')));
});

test('YAML comments follow indentation scope and do not leak to parent keys', () => {
  const source = [
    'app:',
    '  settings:',
    '    # nested tail comment',
    '  next: true',
  ].join('\n');

  const result = CodePreviewProvider.parse(source, 'yaml');
  const payloads = extractCommentPayloads(result.html);

  assert.ok(result.html.includes('tree-standalone-comment'));
  assert.ok(payloads.some(payload => payload.some(item => item.marker === '#' && item.text === 'nested tail comment')));
  assert.equal(/<span class="tree-key" data-line="\d+">next<\/span><span class="tree-comment-icon codicon codicon-note"/.test(result.html), false);
});

test('JSON comments follow object containment and do not leak to parent siblings', () => {
  const source = [
    '{',
    '  "outer": {',
    '    // nested tail comment',
    '  },',
    '  "next": 1',
    '}',
  ].join('\n');

  const result = CodePreviewProvider.parse(source, 'json');
  const payloads = extractCommentPayloads(result.html);

  assert.ok(result.html.includes('tree-standalone-comment'));
  assert.ok(payloads.some(payload => payload.some(item => item.marker === '/' && item.text === 'nested tail comment')));
  assert.equal(/<span class="tree-key" data-line="\d+">next<\/span><span class="tree-comment-icon codicon codicon-note"/.test(result.html), false);
});

test('XML comments follow object containment and do not leak to parent siblings', () => {
  const source = [
    '<root>',
    '  <parent>',
    '    <!-- nested tail comment -->',
    '  </parent>',
    '  <next>1</next>',
    '</root>',
  ].join('\n');

  const result = CodePreviewProvider.parse(source, 'xml');
  const payloads = extractCommentPayloads(result.html);

  assert.ok(result.html.includes('tree-standalone-comment'));
  assert.ok(payloads.some(payload => payload.some(item => item.marker === '-' && item.text === 'nested tail comment')));
  assert.equal(/<span class="tree-key" data-line="\d+">next<\/span><span class="tree-comment-icon codicon codicon-note"/.test(result.html), false);
});

test('JSON comment before object key keeps binding across blank lines', () => {
  const source = [
    '{',
    '  // settings object',
    '',
    '  "settings": {',
    '    "theme": "dark"',
    '  }',
    '}',
  ].join('\n');

  const result = CodePreviewProvider.parse(source, 'json');
  const payloads = extractCommentPayloads(result.html);

  assert.ok(/<span class="tree-key" data-line="\d+">settings<\/span><span class="tree-comment-icon codicon codicon-note"/.test(result.html));
  assert.ok(payloads.some(payload => payload.some(item => item.marker === '/' && item.text === 'settings object')));
  assert.equal(result.html.includes('tree-standalone-comment'), false);
});

test('JSON leading block comment binds to same-line key', () => {
  const source = [
    '{',
    '  "meta": {',
    '    /* maintainer docs */ "maintainer": "Preview Team",',
    '    "flags": {}',
    '  }',
    '}',
  ].join('\n');

  const result = CodePreviewProvider.parse(source, 'json');
  const payloads = extractCommentPayloads(result.html);

  assert.ok(/<span class="tree-key" data-line="\d+">maintainer<\/span><span class="tree-comment-icon codicon codicon-note"/.test(result.html));
  assert.equal(/<span class="tree-key" data-line="\d+">flags<\/span><span class="tree-comment-icon codicon codicon-note"/.test(result.html), false);
  assert.ok(payloads.some(payload => payload.some(item => item.marker === '*' && item.text === 'maintainer docs')));
});

test('TOML comment before object key keeps binding across blank lines', () => {
  const source = [
    '[base]',
    'enabled = true',
    '',
    '# server object',
    '',
    '[server]',
    'host = "localhost"',
  ].join('\n');

  const result = CodePreviewProvider.parse(source, 'toml');
  const payloads = extractCommentPayloads(result.html);

  assert.ok(/<span class="tree-key" data-line="\d+">server<\/span><span class="tree-comment-icon codicon codicon-note"/.test(result.html));
  assert.ok(payloads.some(payload => payload.some(item => item.marker === '#' && item.text === 'server object')));
  assert.equal(result.html.includes('tree-standalone-comment'), false);
});

test('XML comment before object key keeps binding across blank lines', () => {
  const source = [
    '<!-- catalog object -->',
    '',
    '<catalog>',
    '  <book id="101" category="fiction">',
    '    <title>The Great Gatsby</title>',
    '  </book>',
    '</catalog>',
  ].join('\n');

  const result = CodePreviewProvider.parse(source, 'xml');
  const payloads = extractCommentPayloads(result.html);

  assert.ok(/<span class="tree-key" data-line="\d+">catalog<\/span><span class="tree-comment-icon codicon codicon-note"/.test(result.html));
  assert.ok(payloads.some(payload => payload.some(item => item.marker === '-' && item.text === 'catalog object')));
  assert.equal(result.html.includes('tree-standalone-comment'), false);
});

test('JSON comment groups are merged into a single icon payload', () => {
    const source = [
        '// outer comment A',
        '/* outer comment B */',
        '{',
        '  "http.noProxy": [',
        '    "localhost", // array comment A',
        '    "127.0.0.1" /* array comment B */',
        '  ],',
        '  "autoProxy.lastUsedProxyUrl" /* first inline */ /* second inline */ : "http://127.0.0.1:13659"',
        '}',
    ].join('\n');

    const result = CodePreviewProvider.parse(source, 'json');
  const payloads = extractCommentPayloads(result.html);

  assert.ok(result.html.includes('tree-standalone-comment'));
  assert.equal(result.html.includes('&#10;&#10;'), false);

  const mergedOuter = payloads.filter(payload => payload.length === 2
    && payload[0].marker === '/'
    && payload[0].text === 'outer comment A'
    && payload[1].marker === '*'
    && payload[1].text === 'outer comment B');
  assert.equal(mergedOuter.length, 1);

  assert.ok(payloads.some(payload => payload.some(item => item.text === 'array comment A' && item.marker === '/')));
  assert.ok(payloads.some(payload => payload.some(item => item.text === 'array comment B' && item.marker === '*')));

  const mergedInline = payloads.filter(payload => payload.length === 2
    && payload[0].text === 'first inline'
    && payload[0].marker === '*'
    && payload[1].text === 'second inline'
    && payload[1].marker === '*');
  assert.equal(mergedInline.length, 1);
});

test('Multiline block and line comments merge into one popup payload', () => {
  const source = [
    '{',
    '  /* block comment line 1',
    '   * block comment line 2',
    '   */',
    '  // line comment after block',
    '  "name": "Alice"',
    '}',
  ].join('\n');

  const result = CodePreviewProvider.parse(source, 'json');
  const payloads = extractCommentPayloads(result.html);

  const merged = payloads.filter(payload => payload.length === 2
    && payload[0].marker === '*'
    && payload[0].text === 'block comment line 1\nblock comment line 2'
    && payload[1].marker === '/'
    && payload[1].text === 'line comment after block');

  assert.equal(merged.length, 1);
});

test('Consecutive multiline block comments merge into one popup payload', () => {
  const source = [
    '{',
    '  /* first block line 1',
    '   * first block line 2',
    '   */',
    '  /* second block line 1',
    '   * second block line 2',
    '   */',
    '  "name": "Alice"',
    '}',
  ].join('\n');

  const result = CodePreviewProvider.parse(source, 'json');
  const payloads = extractCommentPayloads(result.html);

  const merged = payloads.filter(payload => payload.length === 2
    && payload[0].marker === '*'
    && payload[0].text === 'first block line 1\nfirst block line 2'
    && payload[1].marker === '*'
    && payload[1].text === 'second block line 1\nsecond block line 2');

  assert.equal(merged.length, 1);
});

test('Trailing array comment without next element becomes standalone icon', () => {
  const source = [
    '{',
    '  "items": [',
    '    1',
    '    // tail comment',
    '  ],',
    '  "next": 2',
    '}',
  ].join('\n');

  const result = CodePreviewProvider.parse(source, 'json');
  const payloads = extractCommentPayloads(result.html);

  assert.ok(result.html.includes('tree-standalone-comment'));
  assert.ok(payloads.some(payload => payload.length === 1 && payload[0].marker === '/' && payload[0].text === 'tail comment'));
  assert.equal(/<span class="tree-key" data-line="\d+">next<\/span><span class="tree-comment-icon codicon codicon-note"/.test(result.html), false);
});

test('Task G JSON fixture label ownership mapping is correct', () => {
  const source = readSupportedFixture('json.jsonc');
  const result = CodePreviewProvider.parse(source, 'json');
  const owners = extractCommentOwners(result.html);
  const labelOwners = buildLabelOwnerMap(owners);

  assertLabelOwner(labelOwners, 'A', 'standalone', 'standalone');

  assertLabelOwner(labelOwners, 'B', 'key', 'meta');
  assertLabelOwner(labelOwners, 'C', 'key', 'meta');
  assertSameOwner(labelOwners, ['B', 'C']);

  const dOwner = assertLabelOwner(labelOwners, 'D', 'key', 'name');
  assert.ok(dOwner.comments.some(comment => comment.marker === '/' && /triple slash note \[D\]$/.test(comment.text)));

  const eOwner = assertLabelOwner(labelOwners, 'E', 'key', 'version');
  assert.ok(eOwner.comments.some(comment => comment.marker === '/' && comment.text === '! bang-style line comment [E]'));

  const fOwner = assertLabelOwner(labelOwners, 'F', 'key', 'url');
  assert.ok(fOwner.comments.some(comment => comment.text === 'ensure // in string is preserved [F]'));

  assertLabelOwner(labelOwners, 'G', 'key', 'maintainer');

  assertLabelOwner(labelOwners, 'H', 'key', 'experimental');
  assertLabelOwner(labelOwners, 'I', 'key', 'experimental');
  assertLabelOwner(labelOwners, 'J', 'key', 'experimental');
  assertSameOwner(labelOwners, ['H', 'I', 'J']);

  const kOwner = assertLabelOwner(labelOwners, 'K', 'key', 'strict');
  assert.ok(kOwner.comments.some(comment => comment.marker === '/' && comment.text === '// slash-heavy non-mainstream line comment [K]'));

  assertLabelOwner(labelOwners, 'L', 'key', 'records');
  assertLabelOwner(labelOwners, 'M', 'index', '0');
  assertLabelOwner(labelOwners, 'N', 'key', 'score');
  assertLabelOwner(labelOwners, 'O', 'index', '1');
  assertLabelOwner(labelOwners, 'P', 'key', 'name');
  assertLabelOwner(labelOwners, 'Q', 'key', 'score');

  const rOwner = assertLabelOwner(labelOwners, 'R', 'index', '0');
  assert.ok(rOwner.comments.some(comment => comment.marker === '*' && comment.text === 'inline block item [R]'));

  const sOwner = assertLabelOwner(labelOwners, 'S', 'index', '1');
  assert.ok(sOwner.comments.some(comment => comment.marker === '/' && /triple slash list item \[S\]$/.test(comment.text)));

  assertLabelOwner(labelOwners, 'T', 'standalone', 'standalone');
  assertLabelOwner(labelOwners, 'U', 'standalone', 'standalone');
  assert.notEqual(
    getSingleLabelOwner(labelOwners, 'T').id,
    getSingleLabelOwner(labelOwners, 'U').id,
    'labels [T] and [U] should not share one popup entry'
  );
  assertLabelOwner(labelOwners, 'V', 'key', 'commentStyles');
  assertLabelOwner(labelOwners, 'W', 'index', '2');
  assertLabelOwner(labelOwners, 'X', 'key', 'note');
  assertLabelOwner(labelOwners, 'Y', 'standalone', 'standalone');
  assertLabelOwner(labelOwners, 'Z', 'standalone', 'standalone');
});

test('Task G TOML fixture label ownership mapping is correct', () => {
  const source = readSupportedFixture('toml.toml');
  const result = CodePreviewProvider.parse(source, 'toml');
  const owners = extractCommentOwners(result.html);
  const labelOwners = buildLabelOwnerMap(owners);

  assertLabelOwner(labelOwners, 'A', 'standalone', 'standalone');
  assertLabelOwner(labelOwners, 'B', 'standalone', 'standalone');
  assertSameOwner(labelOwners, ['A', 'B']);

  assertLabelOwner(labelOwners, 'C', 'key', 'name');
  assertLabelOwner(labelOwners, 'D', 'key', 'compression');
  assertLabelOwner(labelOwners, 'E', 'key', 'dependencies');
  assertLabelOwner(labelOwners, 'F', 'key', 'serde_json');
  assertLabelOwner(labelOwners, 'G', 'key', 'rustls');

  assertLabelOwner(labelOwners, 'H', 'key', 'dev-dependencies');
  assertLabelOwner(labelOwners, 'I', 'key', 'dev-dependencies');
  assertSameOwner(labelOwners, ['H', 'I']);

  assertLabelOwner(labelOwners, 'J', 'key', 'lto');
  assertLabelOwner(labelOwners, 'K', 'key', 'bench');
  assertLabelOwner(labelOwners, 'L', 'standalone', 'standalone');
});

test('TOML fixture nested duplicate keys map to correct section lines', () => {
  const source = readSupportedFixture('toml.toml');
  const result = CodePreviewProvider.parse(source, 'toml');

  const benchLines = extractKeyLines(result.html, 'bench');
  assert.deepEqual(benchLines, [69, 78]);
  assertLineContains(source, '[profile.bench]', benchLines[0]);
  assertLineContains(source, '[[bench]]', benchLines[1]);

  const metadataLines = extractKeyLines(result.html, 'metadata');
  assert.deepEqual(metadataLines, [87, 82]);
  assertLineContains(source, '[package.metadata.docs.rs]', metadataLines[0]);
  assertLineContains(source, '[workspace.metadata.release]', metadataLines[1]);
});

test('Task G XML fixture label ownership mapping is correct', () => {
  const source = readSupportedFixture('xml.xml');
  const result = CodePreviewProvider.parse(source, 'xml');
  const owners = extractCommentOwners(result.html);
  const labelOwners = buildLabelOwnerMap(owners);

  assertLabelOwner(labelOwners, 'A', 'standalone', 'standalone');
  assertLabelOwner(labelOwners, 'B', 'key', 'catalog');
  assertLabelOwner(labelOwners, 'C', 'key', 'products');
  assertLabelOwner(labelOwners, 'D', 'key', 'name');
  assertLabelOwner(labelOwners, 'E', 'index', '0');
  assertLabelOwner(labelOwners, 'F', 'key', 'meta:statistics');
  assertLabelOwner(labelOwners, 'G', 'standalone', 'standalone');
  assertLabelOwner(labelOwners, 'H', 'standalone', 'standalone');
});

test('Task G YAML fixture label ownership mapping is correct', () => {
  const source = readSupportedFixture('yaml.yaml');
  const result = CodePreviewProvider.parse(source, 'yaml');
  const owners = extractCommentOwners(result.html);
  const labelOwners = buildLabelOwnerMap(owners);

  assertLabelOwner(labelOwners, 'A', 'standalone', 'standalone');
  assertLabelOwner(labelOwners, 'B', 'standalone', 'standalone');
  assertSameOwner(labelOwners, ['A', 'B']);

  assertLabelOwner(labelOwners, 'C', 'key', 'name');
  assertLabelOwner(labelOwners, 'D', 'key', 'app');
  assertLabelOwner(labelOwners, 'E', 'key', 'app');
  assertLabelOwner(labelOwners, 'F', 'standalone', 'standalone');
  assertLabelOwner(labelOwners, 'G', 'key', 'template');
  assertLabelOwner(labelOwners, 'H', 'key', 'containers');
  assertLabelOwner(labelOwners, 'I', 'key', 'containers');
  assertSameOwner(labelOwners, ['H', 'I']);
  assertLabelOwner(labelOwners, 'J', 'key', 'name');
  assertLabelOwner(labelOwners, 'K', 'key', 'value');
  assertLabelOwner(labelOwners, 'L', 'key', 'name');
  assertLabelOwner(labelOwners, 'M', 'key', 'memory');
  assertLabelOwner(labelOwners, 'N', 'key', 'preferredDuringSchedulingIgnoredDuringExecution');
  assertLabelOwner(labelOwners, 'O', 'key', 'key');
  assertLabelOwner(labelOwners, 'P', 'key', 'apiVersion');
  assertLabelOwner(labelOwners, 'Q', 'key', 'apiVersion');
  assertLabelOwner(labelOwners, 'R', 'key', 'apiVersion');
  assertLabelOwner(labelOwners, 'S', 'standalone', 'standalone');
  assertLabelOwner(labelOwners, 'T', 'standalone', 'standalone');
});

test('Task L JSON standalone comment [T] renders at records[1] tail and [U] stays at records tail', () => {
  const source = readSupportedFixture('json.jsonc');
  const result = CodePreviewProvider.parse(source, 'json');
  const events = extractCommentRenderEvents(result.html);

  const tEvent = getLabelEvent(events, 'T');
  const uEvent = getLabelEvent(events, 'U');

  assert.equal(tEvent.ownerKind, 'standalone');
  assert.equal(tEvent.path, 'records > [1]', 'label [T] should be rendered as records[1] tail standalone');
  assert.equal(tEvent.path.includes('labels'), false, 'label [T] should not remain inside labels array scope');
  assert.equal(uEvent.ownerKind, 'standalone');
  assert.equal(uEvent.path, 'records', 'label [U] should remain as records tail standalone');
});

test('Task J XML final standalone comment [H] renders at document root tail', () => {
  const source = readSupportedFixture('xml.xml');
  const result = CodePreviewProvider.parse(source, 'xml');
  const events = extractCommentRenderEvents(result.html);

  const hEvent = getLabelEvent(events, 'H');
  assert.equal(hEvent.ownerKind, 'standalone');
  assert.equal(hEvent.path, '');
});

test('Task J YAML final standalone comment [T] renders at document root tail', () => {
  const source = readSupportedFixture('yaml.yaml');
  const result = CodePreviewProvider.parse(source, 'yaml');
  const events = extractCommentRenderEvents(result.html);

  const tEvent = getLabelEvent(events, 'T');
  assert.equal(tEvent.ownerKind, 'standalone');
  assert.equal(tEvent.path, '');
});

test('Task J TOML final standalone comment [L] renders at document root tail', () => {
  const source = readSupportedFixture('toml.toml');
  const result = CodePreviewProvider.parse(source, 'toml');
  const events = extractCommentRenderEvents(result.html);

  const lEvent = getLabelEvent(events, 'L');
  assert.equal(lEvent.ownerKind, 'standalone');
  assert.equal(lEvent.path, '');
});

test('Task K TOML parent path uses explicit table line even when child table appears first', () => {
  const source = [
    '[package.metadata.docs]',
    'format = "markdown"',
    '',
    '# parent metadata comment [L]',
    '[package.metadata]',
    'owner = "docs-team"',
  ].join('\n');

  const result = CodePreviewProvider.parse(source, 'toml');
  const metadataLines = extractKeyLines(result.html, 'metadata');

  assert.deepEqual(metadataLines, [4]);
  assertLineContains(source, '[package.metadata]', metadataLines[0]);

  const owners = extractCommentOwners(result.html);
  const labelOwners = buildLabelOwnerMap(owners);
  assertLabelOwner(labelOwners, 'L', 'key', 'metadata');
});

test('Task K YAML standalone comments [F] and [S] render in expected parent scopes', () => {
  const source = readSupportedFixture('yaml.yaml');
  const result = CodePreviewProvider.parse(source, 'yaml');
  const events = extractCommentRenderEvents(result.html);

  const fEvent = getLabelEvent(events, 'F');
  const sEvent = getLabelEvent(events, 'S');

  assert.equal(fEvent.ownerKind, 'standalone');
  assert.equal(fEvent.path, '[0] > spec > selector > matchLabels');

  assert.equal(sEvent.ownerKind, 'standalone');
  assert.equal(sEvent.path, '[3] > spec > selector');
});

test('Task K XML comment [E] follows tag[0] and [G] stays under meta:statistics scope', () => {
  const source = readSupportedFixture('xml.xml');
  const result = CodePreviewProvider.parse(source, 'xml');
  const owners = extractCommentOwners(result.html);
  const labelOwners = buildLabelOwnerMap(owners);
  const events = extractCommentRenderEvents(result.html);

  const gEvent = getLabelEvent(events, 'G');

  assertLabelOwner(labelOwners, 'E', 'index', '0');

  assert.equal(gEvent.ownerKind, 'standalone');
  assert.equal(gEvent.path, 'catalog > meta:statistics');
});

test('MarkdownProvider escapes front matter HTML content', () => {
    const source = [
      '---',
      'title: "<script>alert(1)</script>"',
      'author: "Tom & Jerry"',
      '---',
      '# Heading'
    ].join('\n');

    const result = MarkdownProvider.parse(source);

    assert.ok(result.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(result.html.includes('Tom &amp; Jerry'));
    assert.equal(result.html.includes('<script>alert(1)</script>'), false);
});

test('MarkdownProvider heading extraction ignores fenced code headings', () => {
    const source = [
      '# Real Heading',
      '',
      '```md',
      '## Fake Heading In Code Fence',
      '```',
      '## Another Real Heading',
    ].join('\n');

    const result = MarkdownProvider.parse(source);

    assert.deepEqual(
      result.headings.map(item => item.text),
      ['Real Heading', 'Another Real Heading']
    );
    assert.deepEqual(
      result.headings.map(item => item.line),
      [0, 5]
    );
});

test('MarkdownProvider injects frontmatter-table locate anchor at document top', () => {
  const source = [
    '---',
    'title: Demo',
    'owner: Team',
    '---',
    '# Heading',
  ].join('\n');

  const result = MarkdownProvider.parse(source);

  assert.ok(result.html.includes('<table id="frontmatter-table" class="frontmatter-table">'));
  assert.equal(result.headings[0]?.id, 'frontmatter-table');
  assert.equal(result.headings[0]?.line, 0);
});

test('Supported markdown fixture keeps middle divider and heading locate metadata', () => {
  const source = readSupportedFixture('markdown.md');
  const result = MarkdownProvider.parse(source);

  assert.ok(result.html.includes('<table id="frontmatter-table" class="frontmatter-table">'));
  const middleHeading = result.headings.find(item => item.id === 'middle-divider-locate-check');

  assert.ok(middleHeading);
  assert.ok(/id="middle-divider-locate-check">Middle Divider Locate Check<\/h2>[\s\S]*?<hr>/.test(result.html));

  const located = MarkdownProvider.findCurrentHeading(result.headings, middleHeading.line + 2);
  assert.equal(located?.id, 'middle-divider-locate-check');
});
