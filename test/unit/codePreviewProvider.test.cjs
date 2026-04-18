const test = require('node:test');
const assert = require('node:assert/strict');

const { CodePreviewProvider } = require('../../out/codePreviewProvider');
const { LatexPreviewProvider } = require('../../out/latexPreviewProvider');
const { MermaidPreviewProvider } = require('../../out/mermaidPreviewProvider');
const { supportsLocate, isDataTreeType } = require('../../out/fileTypes');

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
});
