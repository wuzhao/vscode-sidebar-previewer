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
