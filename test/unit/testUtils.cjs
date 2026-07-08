const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { DatatreePreviewProvider } = require('../../out/datatreePreviewProvider');
const { TablePreviewProvider } = require('../../out/tablePreviewProvider');
const { MarkdownProvider } = require('../../out/markdownPreviewProvider');
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

module.exports = {
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
};
