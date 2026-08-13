import fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';

/**
 * 描述 I18nStrings 接口结构
 */
interface I18nStrings {
    emptyStateTitle: string;
    emptyStateText: string;
    zoomStatus: string;
    webviewTitle: string;
    copyCode: string;
    viewCode: string;
    viewPreview: string;
    previewError: string;
    tableSelectionMore: string;
    tableSelectionMarkdownTable: string;
    tableSelectionAsciiTable: string;
    tableSelectionTsv: string;
    tableSelectionTsvHint: string;
    tableSelectionCsv: string;
    locatorCopied: string;
    locatorUnavailable: string;
}

// 定义空状态提示中展示的受支持文件格式列表
const SUPPORTED_EXTENSIONS = [
    'Markdown (.md)',
    'LaTeX (.tex / .latex / .katex)',
    'Mermaid (.mmd / .mermaid)',
    'JSON (.json / .jsonc)',
    'JSONL (.jsonl)',
    'YAML (.yml / .yaml)',
    'TOML (.toml)',
    'XML (.xml)',
    'CSV (.csv)',
    'TSV (.tsv)'
];

// 预先渲染受支持格式列表，复用于各语言文案模板
const SUPPORTED_LIST_HTML = SUPPORTED_EXTENSIONS.map(ext => `<li>${ext}</li>`).join('');

// runtime 文案统一写入 locales/nls*.json
const RUNTIME_NLS_KEYS: { [K in keyof I18nStrings]: string } = {
    emptyStateTitle: 'runtime.emptyStateTitle',
    emptyStateText: 'runtime.emptyStateText',
    zoomStatus: 'runtime.zoomStatus',
    webviewTitle: 'runtime.webviewTitle',
    copyCode: 'runtime.copyCode',
    viewCode: 'runtime.viewCode',
    viewPreview: 'runtime.viewPreview',
    previewError: 'runtime.previewError',
    tableSelectionMore: 'runtime.tableSelectionMore',
    tableSelectionMarkdownTable: 'runtime.tableSelectionMarkdownTable',
    tableSelectionAsciiTable: 'runtime.tableSelectionAsciiTable',
    tableSelectionTsv: 'runtime.tableSelectionTsv',
    tableSelectionTsvHint: 'runtime.tableSelectionTsvHint',
    tableSelectionCsv: 'runtime.tableSelectionCsv',
    locatorCopied: 'runtime.locatorCopied',
    locatorUnavailable: 'runtime.locatorUnavailable'
};

const FALLBACK_STRINGS: I18nStrings = {
    emptyStateTitle: 'Sidebar Previewer',
    emptyStateText: 'Preview not supported for this file type.<br />Supported formats:<ul>{0}</ul>',
    zoomStatus: 'Sidebar Previewer Zoom: {0}%',
    webviewTitle: 'Sidebar Previewer',
    copyCode: 'Copy',
    viewCode: 'Code',
    viewPreview: 'Preview',
    previewError: 'Preview Failed',
    tableSelectionMore: 'Actions',
    tableSelectionMarkdownTable: 'Copy as Markdown',
    tableSelectionAsciiTable: 'Copy as ASCII',
    tableSelectionTsv: 'Copy as TSV',
    tableSelectionTsvHint: 'For Excel, Numbers & Sheets',
    tableSelectionCsv: 'Copy as CSV',
    locatorCopied: 'Copied Locator: {0}',
    locatorUnavailable: 'No highlighted data tree region available'
};

type NlsBundle = Record<string, string>;
let currentBundle: NlsBundle = {};

function formatTemplate(template: string, ...args: string[]): string {
    return template.replace(/{(\d+)}/g, (match, index) => args[index] ?? match);
}

// 归一化语言标识，用于匹配 nls.* 文件
function normalizeLocale(locale: string): string {
    return locale.replace(/_/g, '-').toLowerCase();
}

function resolveNlsFileName(locale: string): string {
    const normalized = normalizeLocale(locale);

    if (normalized.startsWith('zh-cn')) {
        return 'nls.zh-cn.json';
    }
    if (normalized.startsWith('zh-tw')) {
        return 'nls.zh-tw.json';
    }
    if (normalized.startsWith('zh-hk')) {
        return 'nls.zh-hk.json';
    }
    if (normalized.startsWith('ja')) {
        return 'nls.ja-jp.json';
    }

    return 'nls.json';
}

function loadNlsBundle(fileName: string): NlsBundle {
    try {
        const rootPath = path.resolve(__dirname, '..');
        const filePath = path.join(rootPath, 'locales', fileName);
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);

        if (parsed && typeof parsed === 'object') {
            return parsed as NlsBundle;
        }
    } catch {
        // 文件不存在或解析失败时，回退到默认英文文案
    }

    return {};
}

// 从 locales/nls*.json 初始化当前语言包
export function initI18n(): void {
    const localeFile = resolveNlsFileName(vscode.env.language);
    const fallbackBundle = loadNlsBundle('nls.json');
    const localeBundle = localeFile === 'nls.json' ? {} : loadNlsBundle(localeFile);

    currentBundle = { ...fallbackBundle, ...localeBundle };
}

function getString(key: keyof I18nStrings): string {
    const nlsKey = RUNTIME_NLS_KEYS[key];
    const localized = currentBundle[nlsKey];

    if (typeof localized === 'string' && localized.length > 0) {
        return localized;
    }

    return FALLBACK_STRINGS[key];
}

export const i18n = {
    get emptyStateTitle(): string {
        return getString('emptyStateTitle');
    },
    get emptyStateText(): string {
        return formatTemplate(getString('emptyStateText'), SUPPORTED_LIST_HTML);
    },
    get zoomStatus(): string {
        return getString('zoomStatus');
    },
    get webviewTitle(): string {
        return getString('webviewTitle');
    },
    get copyCode(): string {
        return getString('copyCode');
    },
    get viewCode(): string {
        return getString('viewCode');
    },
    get viewPreview(): string {
        return getString('viewPreview');
    },
    get previewError(): string {
        return getString('previewError');
    },
    get tableSelectionMore(): string {
        return getString('tableSelectionMore');
    },
    get tableSelectionMarkdownTable(): string {
        return getString('tableSelectionMarkdownTable');
    },
    get tableSelectionAsciiTable(): string {
        return getString('tableSelectionAsciiTable');
    },
    get tableSelectionTsv(): string {
        return getString('tableSelectionTsv');
    },
    get tableSelectionTsvHint(): string {
        return getString('tableSelectionTsvHint');
    },
    get tableSelectionCsv(): string {
        return getString('tableSelectionCsv');
    },
    get locatorCopied(): string {
        return getString('locatorCopied');
    },
    get locatorUnavailable(): string {
        return getString('locatorUnavailable');
    },

    // 将运行时文案模板中的占位符替换为具体值
    format(template: string, ...args: string[]): string {
        return formatTemplate(template, ...args);
    }
};
