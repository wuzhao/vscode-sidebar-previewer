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
    assert.equal(csvResult.supportsLocate, false);
    assert.equal(tsvResult.supportsLocate, false);

    assert.ok(csvResult.html.includes('<table class="tabular-table">'));
    assert.ok(tsvResult.html.includes('<table class="tabular-table">'));
    assert.ok(csvResult.html.includes('Monitor, 27&quot; 4K'));
    assert.ok(tsvResult.html.includes('contains'));
    assert.equal(csvResult.html.includes('Failed to parse CSV content.'), false);
    assert.equal(tsvResult.html.includes('Failed to parse TSV content.'), false);
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
  assertLabelOwner(labelOwners, 'E', 'key', 'tag');
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
