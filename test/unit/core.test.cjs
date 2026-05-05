const {
  test,
  assert,
  fs,
  path,
  vm,
  CodePreviewProvider,
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

test('MarkdownProvider task checkbox line mapping supports ordered task items', () => {
  const source = [
    '- [x] top level done',
    '  1. [ ] nested ordered todo',
    '  2. [x] nested ordered done',
    '- [ ] second top level todo',
  ].join('\n');

  const result = MarkdownProvider.parse(source);
  const lineMatches = Array.from(
    result.html.matchAll(/<input type="checkbox"(?: checked="")? data-line="(\d+)">/g),
    match => Number(match[1])
  );

  assert.deepEqual(lineMatches, [0, 1, 2, 3]);
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
    assert.ok(result.html.includes('pilgrimage'));
    assert.ok(result.html.includes('@generatedAt'));
  });

  test('XML special keys map to source lines for locate', () => {
    const source = readSupportedFixture('xml.xml');
    const result = CodePreviewProvider.parse(source, 'xml');
    const lines = source.split('\n');

    const textLines = extractKeyLines(result.html, '#TEXT');
    const cdataLines = extractKeyLines(result.html, '#CDATA');
    const declarationLines = extractKeyLines(result.html, '?xml');
    const missionPiLines = extractKeyLines(result.html, '?mission');
    const auditPiLines = extractKeyLines(result.html, '?audit');

    assert.ok(textLines.length > 0);
    assert.ok(cdataLines.length > 0);
    assert.ok(declarationLines.length > 0);
    assert.ok(missionPiLines.length > 0);
    assert.ok(auditPiLines.length > 0);
    assert.deepEqual(textLines.slice(0, 2), [23, 29]);

    textLines.forEach(line => {
      assert.equal(/^\s*<!/.test(lines[line]), false, `#TEXT line ${line} should not bind to DTD directives`);
      assert.notEqual(lines[line].trim(), ']>', `#TEXT line ${line} should not bind to DTD closing marker`);
      const plainText = lines[line]
        .replace(/<!--.*?-->/g, ' ')
        .replace(/<[^>]*>/g, ' ')
        .trim();
      assert.ok(plainText.length > 0, `#TEXT line ${line} should include visible text content`);
    });

    cdataLines.forEach(line => assertLineContains(source, '<![CDATA[', line));
    declarationLines.forEach(line => assertLineContains(source, '<?xml', line));
    missionPiLines.forEach(line => assertLineContains(source, '<?mission', line));
    auditPiLines.forEach(line => assertLineContains(source, '<?audit', line));
  });

  test('XML DTD directive keys map to source lines for locate', () => {
    const source = readSupportedFixture('xml.xml');
    const result = CodePreviewProvider.parse(source, 'xml');

    const doctypeLines = extractKeyLines(result.html, '!DOCTYPE');
    const declarationLines = extractKeyLines(result.html, '#DECLARATION');
    const elementLines = extractKeyLines(result.html, '!ELEMENT');
    const attlistLines = extractKeyLines(result.html, '!ATTLIST');
    const entityLines = extractKeyLines(result.html, '!ENTITY');
    const notationLines = extractKeyLines(result.html, '!NOTATION');

    assert.ok(doctypeLines.length > 0);
    assert.ok(declarationLines.length > 0);
    assert.ok(elementLines.length > 0);
    assert.ok(attlistLines.length > 0);
    assert.ok(entityLines.length > 0);
    assert.ok(notationLines.length > 0);

    doctypeLines.forEach(line => assertLineContains(source, '<!DOCTYPE', line));
    declarationLines.forEach(line => assertLineContains(source, '<!DOCTYPE', line));
    elementLines.forEach(line => assertLineContains(source, '<!ELEMENT', line));
    attlistLines.forEach(line => assertLineContains(source, '<!ATTLIST', line));
    entityLines.forEach(line => assertLineContains(source, '<!ENTITY', line));
    notationLines.forEach(line => assertLineContains(source, '<!NOTATION', line));
  });

  test('XML preamble processing instructions keep source order before DOCTYPE', () => {
    const source = readSupportedFixture('xml.xml');
    const result = CodePreviewProvider.parse(source, 'xml');

    const xmlPos = result.html.indexOf('>?xml</span>');
    const missionPos = result.html.indexOf('>?mission</span>');
    const doctypePos = result.html.indexOf('>!DOCTYPE</span>');

    assert.ok(xmlPos >= 0);
    assert.ok(missionPos >= 0);
    assert.ok(doctypePos >= 0);
    assert.ok(xmlPos < missionPos);
    assert.ok(missionPos < doctypePos);
  });

  test('XML DTD directives are nested under !DOCTYPE block', () => {
    const source = readSupportedFixture('xml.xml');
    const result = CodePreviewProvider.parse(source, 'xml');

    const doctypePos = result.html.indexOf('>!DOCTYPE</span>');
    const doctypeBracketPos = result.html.indexOf('<span class="tree-bracket">{', doctypePos);
    const elementPos = result.html.indexOf('>!ELEMENT</span>', doctypePos);

    assert.ok(doctypePos >= 0);
    assert.ok(doctypeBracketPos > doctypePos);
    assert.ok(elementPos > doctypeBracketPos);
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

  test('XML multiline tag attributes locate to opening tag line', () => {
    const source = [
      '<root>',
      '  <entry',
      '    code="A-01"',
      '    mode="strict">ok</entry>',
      '</root>',
    ].join('\n');

    const result = CodePreviewProvider.parse(source, 'xml');
    const codeLines = extractKeyLines(result.html, '@code');
    const modeLines = extractKeyLines(result.html, '@mode');

    assert.deepEqual(codeLines, [1]);
    assert.deepEqual(modeLines, [1]);
    codeLines.forEach(line => assertLineContains(source, '<entry', line));
    modeLines.forEach(line => assertLineContains(source, '<entry', line));
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
    assert.ok(csvResult.html.includes('Dragon Palace of the Eastern Sea'));
    assert.ok(tsvResult.html.includes('T-01'));
    assert.ok(csvResult.html.includes('table-index-column'));
    assert.ok(tsvResult.html.includes('table-index-column'));
    assert.equal(csvResult.html.includes('Failed to parse CSV content.'), false);
    assert.equal(tsvResult.html.includes('Failed to parse TSV content.'), false);
  });
