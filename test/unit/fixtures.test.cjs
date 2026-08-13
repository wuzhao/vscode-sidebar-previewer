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

function findSingleOwnerByCommentText(owners, textSnippet) {
  const matches = owners.filter(owner =>
    owner.comments.some(comment => comment.text.includes(textSnippet))
  );
  assert.equal(matches.length, 1, `comment containing "${textSnippet}" should map to exactly one owner`);
  return matches[0];
}

function assertCommentOwner(owners, textSnippet, expectedKind, expectedTarget) {
  const owner = findSingleOwnerByCommentText(owners, textSnippet);
  assert.equal(owner.kind, expectedKind, `comment containing "${textSnippet}" should bind to ${expectedKind}`);
  assert.equal(owner.target, expectedTarget, `comment containing "${textSnippet}" should bind to ${expectedTarget}`);
  return owner;
}

test('Task G JSON fixture label ownership mapping is correct', () => {
  const source = readSupportedFixture('json.jsonc');
  const result = DatatreePreviewProvider.parse(source, 'json');
  const owners = extractCommentOwners(result.html);
  const labelOwners = buildLabelOwnerMap(owners);

  assert.deepEqual([...labelOwners.keys()].sort(), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'Z']);

  assertLabelOwner(labelOwners, 'A', 'key', 'meta');
  assertLabelOwner(labelOwners, 'B', 'key', 'title');
  assertLabelOwner(labelOwners, 'C', 'key', 'routePlan');
  assertLabelOwner(labelOwners, 'D', 'index', '0');
  assertLabelOwner(labelOwners, 'E', 'index', '0');
  assertLabelOwner(labelOwners, 'F', 'key', 'ifEvidenceLow');
  assertLabelOwner(labelOwners, 'G', 'index', '1');
  assertLabelOwner(labelOwners, 'H', 'index', '1');
  assertLabelOwner(labelOwners, 'I', 'index', '2');
  assertLabelOwner(labelOwners, 'Z', 'key', 'tailNote');
});

test('Task G TOML fixture label ownership mapping is correct', () => {
  const source = readSupportedFixture('toml.toml');
  const result = DatatreePreviewProvider.parse(source, 'toml');
  const owners = extractCommentOwners(result.html);
  const labelOwners = buildLabelOwnerMap(owners);

  assert.equal(labelOwners.size, 0);

  assertCommentOwner(owners, 'Escalation stage 1 comment before AoT section', 'index', '0');
  assertCommentOwner(owners, 'Escalation stage 2 contains containment strategy', 'index', '1');
  assertCommentOwner(owners, 'Escalation stage 3 is mediation route', 'index', '2');
  assertCommentOwner(owners, 'mountain heavy', 'index', '0');
  assertCommentOwner(owners, 'river heavy', 'index', '1');
  assertCommentOwner(owners, 'fortress heavy', 'index', '2');

  const tailOwner = assertCommentOwner(owners, 'Tail standalone comment for end-of-file behavior', 'standalone', 'standalone');
  assert.ok(tailOwner.comments.some(comment => comment.text.includes('Auxiliary CN')));
});

test('TOML fixture nested duplicate keys map to correct section lines', () => {
  const source = readSupportedFixture('toml.toml');
  const result = DatatreePreviewProvider.parse(source, 'toml');

  const nameLines = extractKeyLines(result.html, 'name');
  assert.equal(nameLines.length, 5);
  assertLineContains(source, 'name = "observe"', nameLines[0]);
  assertLineContains(source, 'name = "contain"', nameLines[1]);
  assertLineContains(source, 'name = "mediate"', nameLines[2]);
  assertLineContains(source, 'name = "early-route"', nameLines[3]);
  assertLineContains(source, 'name = "final-approach"', nameLines[4]);

  const chaptersLines = extractKeyLines(result.html, 'chapters');
  assert.equal(chaptersLines.length, 2);
  assertLineContains(source, 'chapters = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16]', chaptersLines[0]);
  assertLineContains(source, 'chapters = [79, 80, 81, 82, 83, 84, 85, 86, 87, 88]', chaptersLines[1]);
});

test('TOML inline table child keys map to branch_priority assignment line', () => {
  const source = readSupportedFixture('toml.toml');
  const result = DatatreePreviewProvider.parse(source, 'toml');

  const mainRouteLines = extractKeyLines(result.html, 'main_route');
  const riverDetourLines = extractKeyLines(result.html, 'branch_river_detour');
  const westRidgeLines = extractKeyLines(result.html, 'branch_west_ridge');

  assert.equal(mainRouteLines.length, 1);
  assert.equal(riverDetourLines.length, 1);
  assert.equal(westRidgeLines.length, 1);

  assertLineContains(source, 'branch_priority = { main_route = 1', mainRouteLines[0]);
  assertLineContains(source, 'branch_priority = { main_route = 1', riverDetourLines[0]);
  assertLineContains(source, 'branch_priority = { main_route = 1', westRidgeLines[0]);
});

test('TOML inline table comment binds to parent key only', () => {
  const source = readSupportedFixture('toml.toml');
  const result = DatatreePreviewProvider.parse(source, 'toml');
  const owners = extractCommentOwners(result.html);

  assertCommentOwner(owners, 'stable sort order', 'key', 'branch_priority');

  ['main_route', 'branch_river_detour', 'branch_west_ridge'].forEach(target => {
    const hasCommentOwner = owners.some(owner => owner.kind === 'key' && owner.target === target && owner.comments.length > 0);
    assert.equal(hasCommentOwner, false, `${target} should not have comment ownership`);
  });
});

test('Task G XML fixture label ownership mapping is correct', () => {
  const source = readSupportedFixture('xml.xml');
  const result = DatatreePreviewProvider.parse(source, 'xml');
  const owners = extractCommentOwners(result.html);
  const labelOwners = buildLabelOwnerMap(owners);

  assert.deepEqual([...labelOwners.keys()].sort(), ['A', 'B', 'C']);
  assertLabelOwner(labelOwners, 'A', 'standalone', 'standalone');
  assertLabelOwner(labelOwners, 'B', 'key', 'pilgrimage');
  assertLabelOwner(labelOwners, 'C', 'standalone', 'standalone');
});

test('Task G YAML fixture label ownership mapping is correct', () => {
  const source = readSupportedFixture('yaml.yaml');
  const result = DatatreePreviewProvider.parse(source, 'yaml');
  const owners = extractCommentOwners(result.html);
  const labelOwners = buildLabelOwnerMap(owners);

  assert.equal(labelOwners.size, 0);

  assertCommentOwner(owners, 'Route plan includes nested arrays and objects with comments in mixed positions', 'standalone', 'standalone');
  assertCommentOwner(owners, 'second checkpoint comment block', 'key', 'id');
  assertCommentOwner(owners, 'Object merge example based on anchored object', 'standalone', 'standalone');

  const tailOwner = assertCommentOwner(owners, 'Tail standalone comment', 'standalone', 'standalone');
  assert.ok(tailOwner.comments.some(comment => comment.text.includes('Auxiliary CN')));
});

test('Task L JSON array comments stay in the expected scopes', () => {
  const source = readSupportedFixture('json.jsonc');
  const result = DatatreePreviewProvider.parse(source, 'json');
  const events = extractCommentRenderEvents(result.html);

  const dEvent = getLabelEvent(events, 'D');
  const hEvent = getLabelEvent(events, 'H');

  assert.equal(dEvent.ownerKind, 'index');
  assert.equal(dEvent.path.includes('routePlan'), true);
  assert.equal(hEvent.ownerKind, 'key');
  assert.equal(hEvent.path, 'commentStyles');
});

test('Task F JSON fixture inline object keys map to correct nested array lines', () => {
  const source = readSupportedFixture('json.jsonc');
  const result = DatatreePreviewProvider.parse(source, 'json');

  const nameLines = extractKeyLines(result.html, 'name');
  assert.equal(nameLines.length, 8);
  assertLineContains(source, '{ "name": "Sun Wukong", "role": "defender" },', nameLines[0]);
  assertLineContains(source, '{ "name": "Xuanzang", "role": "verification" }', nameLines[1]);
  assertLineContains(source, '{ "name": "Zhu Bajie", "role": "support" },', nameLines[2]);
  assertLineContains(source, '{ "name": "Sha Wujing", "role": "rear-guard" }', nameLines[3]);
  assertLineContains(source, '{ "name": "Sun Wukong", "role": "counter-illusion" },', nameLines[4]);
  assertLineContains(source, '{ "name": "Sha Wujing", "role": "escort-stability" }', nameLines[5]);
  assertLineContains(source, '{ "name": "Xuanzang", "role": "canon-check" },', nameLines[6]);
  assertLineContains(source, '{ "name": "Sun Wukong", "role": "security" }', nameLines[7]);

  const roleLines = extractKeyLines(result.html, 'role');
  assert.equal(roleLines.length, 8);
  assertLineContains(source, '{ "name": "Sun Wukong", "role": "defender" },', roleLines[0]);
  assertLineContains(source, '{ "name": "Xuanzang", "role": "verification" }', roleLines[1]);
  assertLineContains(source, '{ "name": "Zhu Bajie", "role": "support" },', roleLines[2]);
  assertLineContains(source, '{ "name": "Sha Wujing", "role": "rear-guard" }', roleLines[3]);
  assertLineContains(source, '{ "name": "Sun Wukong", "role": "counter-illusion" },', roleLines[4]);
  assertLineContains(source, '{ "name": "Sha Wujing", "role": "escort-stability" }', roleLines[5]);
  assertLineContains(source, '{ "name": "Xuanzang", "role": "canon-check" },', roleLines[6]);
  assertLineContains(source, '{ "name": "Sun Wukong", "role": "security" }', roleLines[7]);

  const actionLines = extractKeyLines(result.html, 'action');
  assert.equal(actionLines.length, 3);
  assertLineContains(source, '{ "action": "recon", "timeoutSec": 300 },', actionLines[0]);
  assertLineContains(source, '{ "action": "request-witness", "timeoutSec": 600 }', actionLines[1]);
  assertLineContains(source, '"action": "protective-formation",', actionLines[2]);

  const timeoutSecLines = extractKeyLines(result.html, 'timeoutSec');
  assert.equal(timeoutSecLines.length, 2);
  assertLineContains(source, '{ "action": "recon", "timeoutSec": 300 },', timeoutSecLines[0]);
  assertLineContains(source, '{ "action": "request-witness", "timeoutSec": 600 }', timeoutSecLines[1]);

  const cpLines = extractKeyLines(result.html, 'cp');
  assert.equal(cpLines.length, 3);
  assertLineContains(source, '{ "cp": "CP-036", "score": 88.9 },', cpLines[0]);
  assertLineContains(source, '{ "cp": "CP-080", "score": 141.8 }', cpLines[1]);
  assertLineContains(source, '{ "cp": "CP-081", "score": 52.1 }', cpLines[2]);

  const scoreLines = extractKeyLines(result.html, 'score');
  assert.equal(scoreLines.length, 3);
  assertLineContains(source, '{ "cp": "CP-036", "score": 88.9 },', scoreLines[0]);
  assertLineContains(source, '{ "cp": "CP-080", "score": 141.8 }', scoreLines[1]);
  assertLineContains(source, '{ "cp": "CP-081", "score": 52.1 }', scoreLines[2]);
});

test('Task J XML final standalone comment [C] keeps root-object scope', () => {
  const source = readSupportedFixture('xml.xml');
  const result = DatatreePreviewProvider.parse(source, 'xml');
  const events = extractCommentRenderEvents(result.html);

  const cEvent = getLabelEvent(events, 'C');
  assert.equal(cEvent.ownerKind, 'standalone');
  assert.equal(cEvent.path, 'pilgrimage');
});

test('Task J YAML final standalone comments remain standalone owners', () => {
  const source = readSupportedFixture('yaml.yaml');
  const result = DatatreePreviewProvider.parse(source, 'yaml');
  const owners = extractCommentOwners(result.html);

  const tailOwner = assertCommentOwner(owners, 'Tail standalone comment', 'standalone', 'standalone');
  assert.ok(tailOwner.comments.some(comment => comment.text.includes('Auxiliary CN')));
});

test('Task J TOML final standalone comments remain standalone owners', () => {
  const source = readSupportedFixture('toml.toml');
  const result = DatatreePreviewProvider.parse(source, 'toml');
  const owners = extractCommentOwners(result.html);

  const tailOwner = assertCommentOwner(owners, 'Tail standalone comment for end-of-file behavior', 'standalone', 'standalone');
  assert.ok(tailOwner.comments.some(comment => comment.text.includes('Auxiliary CN')));
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

  const result = DatatreePreviewProvider.parse(source, 'toml');
  const metadataLines = extractKeyLines(result.html, 'metadata');

  assert.deepEqual(metadataLines, [4]);
  assertLineContains(source, '[package.metadata]', metadataLines[0]);

  const owners = extractCommentOwners(result.html);
  const labelOwners = buildLabelOwnerMap(owners);
  assertLabelOwner(labelOwners, 'L', 'key', 'metadata');
});

test('Task K YAML standalone and checkpoint comments bind to expected owners', () => {
  const source = readSupportedFixture('yaml.yaml');
  const result = DatatreePreviewProvider.parse(source, 'yaml');
  const owners = extractCommentOwners(result.html);

  assertCommentOwner(owners, 'Route plan includes nested arrays and objects with comments in mixed positions', 'standalone', 'standalone');

  const checkpointOwner = assertCommentOwner(owners, 'second checkpoint comment block', 'key', 'id');
  assert.ok(checkpointOwner.comments.some(comment => comment.marker === '#'));
});

test('Task K XML top-level and tail comments bind to expected owners', () => {
  const source = readSupportedFixture('xml.xml');
  const result = DatatreePreviewProvider.parse(source, 'xml');
  const owners = extractCommentOwners(result.html);
  const labelOwners = buildLabelOwnerMap(owners);
  const events = extractCommentRenderEvents(result.html);

  const cEvent = getLabelEvent(events, 'C');

  assertLabelOwner(labelOwners, 'B', 'key', 'pilgrimage');

  assert.equal(cEvent.ownerKind, 'standalone');
  assert.equal(cEvent.path, 'pilgrimage');
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

test('2026-08-13 Task A renders front matter tags and structured JSON values', () => {
  const source = [
    '---',
    'tags:',
    '  - alpha',
    '  - "<beta>"',
    'metadata:',
    '  owner: Team',
    '  retries: 2',
    '  unsafe: "<script>alert(1)</script>"',
    'pipeline:',
    '  - name: lint',
    '    enabled: true',
    'jsonText: \'{"theme":"dark","features":["outline","copy"]}\'',
    'jsonArrayText: \'["outline","copy"]\'',
    'invalidJson: "{not json}"',
    '---',
    '# Heading',
  ].join('\n');

  const result = MarkdownProvider.parse(source);

  assert.ok(result.html.includes(
    '<ul class="fm-tags"><li class="fm-tag">alpha</li><li class="fm-tag">&lt;beta&gt;</li></ul>'
  ));
  assert.ok(result.html.includes(
    '<div class="fm-json">{\n'
      + '  &quot;owner&quot;: &quot;Team&quot;,\n'
      + '  &quot;retries&quot;: 2,\n'
      + '  &quot;unsafe&quot;: &quot;&lt;script&gt;alert(1)&lt;/script&gt;&quot;\n'
      + '}</div>'
  ));
  assert.ok(result.html.includes(
    '<div class="fm-json">[\n'
      + '  {\n'
      + '    &quot;name&quot;: &quot;lint&quot;,\n'
      + '    &quot;enabled&quot;: true\n'
      + '  }\n'
      + ']</div>'
  ));
  assert.ok(result.html.includes(
    '<div class="fm-json">{\n'
      + '  &quot;theme&quot;: &quot;dark&quot;,\n'
      + '  &quot;features&quot;: [\n'
      + '    &quot;outline&quot;,\n'
      + '    &quot;copy&quot;\n'
      + '  ]\n'
      + '}</div>'
  ));
  assert.ok(result.html.includes(
    '<div class="fm-json">[\n'
      + '  &quot;outline&quot;,\n'
      + '  &quot;copy&quot;\n'
      + ']</div>'
  ));
  assert.ok(result.html.includes('<td class="fm-value">{not json}</td>'));
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

test('MarkdownProvider injects frontmatter locate anchor at document top', () => {
  const source = [
    '---',
    'title: Demo',
    'owner: Team',
    '---',
    '# Heading',
  ].join('\n');

  const result = MarkdownProvider.parse(source);

  assert.ok(result.html.includes('<div id="frontmatter" class="frontmatter-wrap"><table class="frontmatter">'));
  assert.equal(result.headings[0]?.id, 'frontmatter');
  assert.equal(result.headings[0]?.line, 0);
});

test('Supported markdown fixture keeps middle divider and heading locate metadata', () => {
  const source = readSupportedFixture('markdown.md');
  const result = MarkdownProvider.parse(source);

  assert.ok(result.html.includes('<div id="frontmatter" class="frontmatter-wrap"><table class="frontmatter">'));
  const middleHeading = result.headings.find(item => item.id === 'middle-divider-locate-check');

  assert.ok(middleHeading);
  assert.ok(/id="middle-divider-locate-check">Middle Divider Locate Check<\/h2>[\s\S]*?<hr>/.test(result.html));
  assert.ok(result.html.includes(
    '<td><input type="checkbox" class="table-task-checkbox" checked=""'
      + ' data-line="321" data-char="12" data-source-line="2" data-source-char="12">Hello</td>'
  ));
  assert.ok(result.html.includes(
    '<td><input type="checkbox" class="table-task-checkbox"'
      + ' data-line="322" data-char="13" data-source-line="3" data-source-char="13"></td>'
  ));
  assert.ok(result.html.includes('![xxx](image.png)'));
  assert.ok(result.html.includes('&lt;u&gt;xxx&lt;/u&gt;'));

  const located = MarkdownProvider.findCurrentHeading(result.headings, middleHeading.line + 2);
  assert.equal(located?.id, 'middle-divider-locate-check');
});
