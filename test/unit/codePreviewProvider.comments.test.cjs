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
} = require('./codePreviewProvider.testUtils.cjs');

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

