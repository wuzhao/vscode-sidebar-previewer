const test = require('node:test');
const assert = require('node:assert/strict');

const { CodePreviewProvider } = require('../../out/codePreviewProvider');
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

    assert.equal(latexResult.supportsLocate, supportsLocate('latex'));
    assert.equal(mermaidResult.supportsLocate, supportsLocate('mermaid'));
    assert.equal(jsonResult.supportsLocate, supportsLocate('json'));

    assert.equal(isDataTreeType('json'), true);
    assert.equal(isDataTreeType('yaml'), true);
    assert.equal(isDataTreeType('toml'), true);
    assert.equal(isDataTreeType('markdown'), false);
    assert.equal(getFileType('settings.jsonc'), 'json');
});

test('CodePreviewProvider parses JSONC (comments and trailing commas)', () => {
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

test('CodePreviewProvider returns an error state for invalid JSON', () => {
    const result = CodePreviewProvider.parse('{"k":', 'json');

    assert.equal(result.fileType, 'json');
    assert.equal(result.supportsLocate, false);
    assert.ok(result.html.includes('Failed to parse JSON content.'));
});

test('Comment icon and tooltip are rendered for JSON/YAML/TOML keys', () => {
    const json = CodePreviewProvider.parse('{\n  "name": "Alice", // profile name\n}', 'json');
    const yaml = CodePreviewProvider.parse('name: Alice # full name', 'yaml');
    const toml = CodePreviewProvider.parse('name = "Alice" # display name', 'toml');

    assert.ok(json.html.includes('tree-comment-icon codicon codicon-comment-discussion'));
    assert.ok(json.html.includes('title="profile name"'));

    assert.ok(yaml.html.includes('tree-comment-icon codicon codicon-comment-discussion'));
    assert.ok(yaml.html.includes('title="full name"'));

    assert.ok(toml.html.includes('tree-comment-icon codicon codicon-comment-discussion'));
    assert.ok(toml.html.includes('title="display name"'));
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
