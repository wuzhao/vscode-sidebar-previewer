const { test, assert, fs, path, vm, RESOURCES_JS_DIR } = require('./testUtils.cjs');
const { createWebviewRuntimeConfig } = require('../../out/previewConfig');

test('首次打开 LaTeX 就能双向定位，空状态跳过格式资源，失败脚本可重试', async () => {
  const listeners = {};
  const messages = [];
  const scripts = [];
  let scrollTop = 0;
  class Element {}
  const content = Object.assign(new Element(), {
    classList: { remove() {} }, style: {}, scrollHeight: 500, clientHeight: 100,
    getBoundingClientRect: () => ({ top: 0 }),
    querySelector: () => null, querySelectorAll: () => [heading],
    get scrollTop() { return scrollTop; },
    scrollTo(target) { scrollTop = target.top; },
    replaceChildren(fragment) { this.fragment = fragment; },
  });
  const heading = { id: 'section', getBoundingClientRect: () => ({ top: 42 }) };
  const document = {
    body: { dataset: { previewConfig: JSON.stringify(createWebviewRuntimeConfig()), jsTable: 'https://test.invalid/table.js' },
      appendChild(script) { scripts.push(script); } },
    head: { querySelectorAll: () => [] }, addEventListener() {},
    getElementById: id => id === 'content' ? content : heading,
    createElement: () => ({ dataset: {}, addEventListener(event, fn) { this[event] = fn; }, remove() { this.removed = true; } }),
    createDocumentFragment: () => ({}),
  };
  const context = vm.createContext({ document, HTMLElement: Element, URL,
    DOMParser: class { parseFromString() { return { body: { querySelectorAll: () => [] } }; } },
    acquireVsCodeApi: () => ({ postMessage: msg => messages.push(msg) }),
    window: { location: { href: 'https://test.invalid/' }, addEventListener(type, fn) { listeners[type] = fn; } },
  });
  vm.runInContext(fs.readFileSync(path.join(RESOURCES_JS_DIR, 'common.js'), 'utf8'), context);
  listeners.message({ data: { type: 'update', content: '<div>empty</div>' } });
  assert.ok(content.fragment);
  assert.equal(scripts.length, 0);
  listeners.message({ data: { type: 'scrollToHeading', headingId: 'section' } });
  assert.equal(scrollTop, 42);
  listeners.message({ data: { type: 'getVisibleHeading' } });
  assert.equal(messages.at(-1).headingId, 'section');

  const first = vm.runInContext("loadPreviewScript('table')", context);
  scripts[0].error();
  await assert.rejects(first);
  assert.ok(scripts[0].removed);
  const retry = vm.runInContext("loadPreviewScript('table')", context);
  assert.equal(scripts.length, 2);
  scripts[1].load();
  await retry;
});

test('多次绑定新表格只保留一组全局拖拽监听', () => {
  let table;
  const events = [];
  const window = { addEventListener: event => events.push(event) };
  const document = { addEventListener() {}, querySelector: () => table };
  const context = { window, document, HTMLElement: class {}, PreviewCommon: { registerDomainInit() {} } };
  vm.runInNewContext(fs.readFileSync(path.join(RESOURCES_JS_DIR, 'table.js'), 'utf8'), context);
  for (let i = 0; i < 10; i++) {
    table = { dataset: {}, closest: () => null, addEventListener() {} };
    window.PreviewTable.bindTableSelection();
  }
  for (const event of ['mousemove', 'mouseup']) assert.equal(events.filter(e => e === event).length, 1);
});

test('Mermaid 隔离错误图，释放超时计时器并忽略已切走的图', async () => {
  let blocks;
  const messages = [];
  const timers = new Set();
  let finish;
  const context = {
    window: { addEventListener() {} }, document: { body: { classList: { contains: () => false } }, querySelectorAll: () => blocks },
    latestUpdateSequence: 1, MERMAID_RENDER_TIMEOUT_MS: 5000, L10N_TEXT: { previewError: '预览错误' },
    setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn),
    VSCODE_API: { postMessage: message => messages.push(message) },
    WEBVIEW_TO_EXTENSION_MESSAGE_TYPES: { mermaidRenderFailed: 'mermaidRenderFailed' },
    mermaid: { initialize() {}, async render(id, source) {
      if (source === 'bad') throw Error('diagram syntax');
      if (source === 'delayed') await new Promise(resolve => { finish = resolve; });
      return { svg: '<svg></svg>' };
    } },
    escapeHtml: String, getErrorMessage: e => e.message,
  };
  const block = textContent => ({ textContent, setAttribute() {}, querySelector: () => null });
  vm.runInNewContext(fs.readFileSync(path.join(RESOURCES_JS_DIR, 'mermaid.js'), 'utf8'), context);
  const render = context.window.PreviewMermaid.renderMermaid;
  blocks = [block('bad'), block('good')];
  await render({ fileType: 'markdown' }, 1);
  assert.ok(blocks[0].innerHTML.includes('预览错误'));
  assert.equal(blocks[1].innerHTML, '<svg></svg>');
  assert.equal(messages.length, 0);
  blocks = [block('bad')];
  await render({ fileType: 'mermaid', revision: 4, version: 2 }, 1);
  assert.equal(messages[0].revision, 4);
  assert.equal(messages[0].detail, 'diagram syntax');
  blocks = [block('delayed')];
  const pending = render({ fileType: 'mermaid' }, 1);
  context.latestUpdateSequence++;
  finish();
  await pending;
  assert.equal(blocks[0].innerHTML, undefined);
  assert.equal(timers.size, 0);
});

test('通过宿主消息回写引用任务并拒绝旧文档的位置，定位无响应时仍保留跟随', async () => {
  const Module = require('node:module');
  const lines = ['> - [ ] 引用任务', '', '- [ ] 正文任务', '# Heading'];
  const callbacks = {};
  const messages = [];
  const disposable = { dispose() {} };
  const document = { uri: { toString: () => 'file:///review.md', fsPath: '/review.md' }, fileName: '/review.md',
    languageId: 'markdown', version: 1, lineCount: lines.length,
    getText: () => lines.join('\n'), lineAt: line => ({ text: lines[line] }) };
  const editor = { document, visibleRanges: [], selections: [] };
  const event = name => handler => { callbacks[name] = handler; return disposable; };
  const vscode = {
    Uri: { file: value => value }, commands: { executeCommand() {} },
    window: { activeTextEditor: editor, onDidChangeActiveTextEditor: event('editor'),
      onDidChangeTextEditorSelection: event('selection'), onDidChangeTextEditorVisibleRanges: event('scroll') },
    Range: class { constructor(line, start, endLine, end) { Object.assign(this, { line, start, end }); } },
    WorkspaceEdit: class { replace(uri, range, value) { Object.assign(this, { range, value }); } },
    workspace: { onDidChangeTextDocument: event('change'), async applyEdit({ range, value }) {
      const { line, start, end } = range;
      lines[line] = lines[line].slice(0, start) + value + lines[line].slice(end);
      document.version++;
      callbacks.change({ document, contentChanges: [{ range: { start: { line } } }] });
      return true;
    } },
  };
  const load = Module._load;
  let PreviewProvider;
  try {
    Module._load = function(name, ...args) { return name === 'vscode' ? vscode : load.call(this, name, ...args); };
    ({ PreviewProvider } = require('../../out/previewProvider'));
  } finally { Module._load = load; }
  const provider = new PreviewProvider({ extensionPath: path.resolve(__dirname, '../..'), globalState: { get: () => true } });
  const view = { visible: true, onDidChangeVisibility: event('visibility'), onDidDispose: event('dispose'),
    webview: { cspSource: 'https://test.invalid', asWebviewUri: p => p,
      onDidReceiveMessage: event('message'), postMessage: m => messages.push(m) } };
  try {
    provider.resolveWebviewView(view);
    callbacks.message({ type: 'webviewReady' });
    const update = messages.findLast(m => m.type === 'update');
    const [, line, char] = update.content.match(/data-line="(\d+)" data-char="(\d+)"/);
    const toggle = { type: 'toggleCheckbox', line: Number(line), char: Number(char), checked: true, revision: update.revision };
    callbacks.message(toggle);
    assert.deepEqual(lines, ['> - [x] 引用任务', '', '- [ ] 正文任务', '# Heading']);
    callbacks.message({ ...toggle, checked: false });
    assert.equal(lines[0], '> - [ ] 引用任务');
    document.version++;
    callbacks.message(toggle);
    assert.equal(lines[0], '> - [ ] 引用任务');
    provider.locateEditor();
    assert.equal(messages.at(-1).type, 'getVisibleHeading');
    callbacks.scroll({ textEditor: editor, visibleRanges: [{ start: { line: 3 } }] });
    assert.equal(messages.at(-1).type, 'scrollToHeading');
    assert.equal(messages.at(-1).headingId, 'heading');
  } finally { provider.dispose(); }
});
