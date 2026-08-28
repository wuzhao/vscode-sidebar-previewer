import fs from 'node:fs';
import path from 'node:path';
import { getSupportedExtensionLabels } from './fileTypes';

/**
 * 定义扩展宿主与 Webview 共用的运行时文案
 */
interface I18nStrings {
    emptyStateTitle: string;
    emptyStateText: string;
    zoomStatus: string;
    webviewTitle: string;
    copyCode: string;
    wrapCode: string;
    unwrapCode: string;
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
    copyFailed: string;
    unknownError: string;
    mermaidRenderTimeout: string;
    mermaidLibraryLoadFailed: string;
    previewInputTooLarge: string;
    previewContentTooLarge: string;
    noTabularRows: string;
    parseContentFailed: string;
    unsupportedFileType: string;
    unterminatedQuotedField: string;
    tableRowsTruncated: string;
    treeNodesTruncated: string;
    invalidMermaidSyntax: string;
}

// 定义空状态提示中展示的受支持文件格式列表
const SUPPORTED_EXTENSIONS = getSupportedExtensionLabels();

// 预先渲染受支持格式列表，复用于各语言文案模板
const SUPPORTED_LIST_HTML = SUPPORTED_EXTENSIONS.map(ext => `<li>${ext}</li>`).join('');

// runtime 文案统一写入 locales/nls*.json
const RUNTIME_NLS_KEYS: { [K in keyof I18nStrings]: string } = {
    emptyStateTitle: 'runtime.emptyStateTitle',
    emptyStateText: 'runtime.emptyStateText',
    zoomStatus: 'runtime.zoomStatus',
    webviewTitle: 'runtime.webviewTitle',
    copyCode: 'runtime.copyCode',
    wrapCode: 'runtime.wrapCode',
    unwrapCode: 'runtime.unwrapCode',
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
    locatorUnavailable: 'runtime.locatorUnavailable',
    copyFailed: 'runtime.copyFailed',
    unknownError: 'runtime.unknownError',
    mermaidRenderTimeout: 'runtime.mermaidRenderTimeout',
    mermaidLibraryLoadFailed: 'runtime.mermaidLibraryLoadFailed',
    previewInputTooLarge: 'runtime.previewInputTooLarge',
    previewContentTooLarge: 'runtime.previewContentTooLarge',
    noTabularRows: 'runtime.noTabularRows',
    parseContentFailed: 'runtime.parseContentFailed',
    unsupportedFileType: 'runtime.unsupportedFileType',
    unterminatedQuotedField: 'runtime.unterminatedQuotedField',
    tableRowsTruncated: 'runtime.tableRowsTruncated',
    treeNodesTruncated: 'runtime.treeNodesTruncated',
    invalidMermaidSyntax: 'runtime.invalidMermaidSyntax'
};

const FALLBACK_STRINGS: I18nStrings = {
    emptyStateTitle: 'Sidebar Previewer',
    emptyStateText: 'Preview not supported for this file type.<br />Supported formats:<ul>{0}</ul>',
    zoomStatus: 'Sidebar Previewer Zoom: {0}%',
    webviewTitle: 'Sidebar Previewer',
    copyCode: 'Copy',
    wrapCode: 'Word Wrap',
    unwrapCode: 'No Word Wrap',
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
    locatorUnavailable: 'No highlighted data tree region available',
    copyFailed: 'Copy failed',
    unknownError: 'Unknown error',
    mermaidRenderTimeout: 'Mermaid rendering timed out',
    mermaidLibraryLoadFailed: 'Mermaid library failed to load',
    previewInputTooLarge: 'Preview input exceeds the {0} MB safety limit',
    previewContentTooLarge: 'Preview content is too large to render safely',
    noTabularRows: 'No tabular rows to preview',
    parseContentFailed: 'Failed to parse {0} content',
    unsupportedFileType: 'Unsupported file type: {0}',
    unterminatedQuotedField: 'Unterminated quoted field',
    tableRowsTruncated: 'Showing the first {0} table rows',
    treeNodesTruncated: 'Showing the first {0} data-tree nodes',
    invalidMermaidSyntax: 'Invalid Mermaid syntax: unrecognized diagram type'
};

type NlsBundle = Record<string, string>;
let currentBundle: NlsBundle = {};

/**
 * 将运行时文案模板中的位置参数替换为展示值
 * @param template - 包含数字占位符的本地化文案
 * @param args - 按占位符顺序传入的展示值
 * @returns 返回完成参数替换的文案
 */
function formatTemplate(template: string, ...args: string[]): string {
    return template.replace(/{(\d+)}/g, (match, index) => args[index] ?? match);
}

/**
 * 归一化 VS Code 语言标识以匹配语言包文件名
 * @param locale - VS Code 当前语言标识
 * @returns 返回使用短横线和小写字符的语言标识
 */
function normalizeLocale(locale: string): string {
    return locale.replace(/_/g, '-').toLowerCase();
}

/**
 * 根据 VS Code 语言标识选择运行时语言包
 * @param locale - VS Code 当前语言标识
 * @returns 返回对应的语言包文件名
 */
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

/**
 * 从扩展安装目录读取指定运行时语言包
 * @param fileName - locales 目录下的语言包文件名
 * @returns 返回解析后的语言键值映射，读取失败时返回空对象
 */
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

/**
 * 按 VS Code 当前语言初始化运行时文案并保留英文回退
 * @param locale - 扩展激活时读取的 VS Code 语言标识
 */
export function initI18n(locale: string): void {
    const localeFile = resolveNlsFileName(locale);
    const fallbackBundle = loadNlsBundle('nls.json');
    const localeBundle = localeFile === 'nls.json' ? {} : loadNlsBundle(localeFile);

    currentBundle = { ...fallbackBundle, ...localeBundle };
}

/**
 * 读取当前语言的运行时文案并在缺失时回退英文
 * @param key - I18nStrings 中的业务文案键
 * @returns 返回可直接展示的本地化文案
 */
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
    get wrapCode(): string {
        return getString('wrapCode');
    },
    get unwrapCode(): string {
        return getString('unwrapCode');
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
    get copyFailed(): string {
        return getString('copyFailed');
    },
    get unknownError(): string {
        return getString('unknownError');
    },
    get mermaidRenderTimeout(): string {
        return getString('mermaidRenderTimeout');
    },
    get mermaidLibraryLoadFailed(): string {
        return getString('mermaidLibraryLoadFailed');
    },
    get previewInputTooLarge(): string {
        return getString('previewInputTooLarge');
    },
    get previewContentTooLarge(): string {
        return getString('previewContentTooLarge');
    },
    get noTabularRows(): string {
        return getString('noTabularRows');
    },
    get parseContentFailed(): string {
        return getString('parseContentFailed');
    },
    get unsupportedFileType(): string {
        return getString('unsupportedFileType');
    },
    get unterminatedQuotedField(): string {
        return getString('unterminatedQuotedField');
    },
    get tableRowsTruncated(): string {
        return getString('tableRowsTruncated');
    },
    get treeNodesTruncated(): string {
        return getString('treeNodesTruncated');
    },
    get invalidMermaidSyntax(): string {
        return getString('invalidMermaidSyntax');
    },

    // 将运行时文案模板中的占位符替换为具体值
    format(template: string, ...args: string[]): string {
        return formatTemplate(template, ...args);
    }
};
