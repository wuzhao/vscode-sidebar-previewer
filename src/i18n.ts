import * as vscode from 'vscode';

/**
 * 描述 I18nStrings 接口结构
 * @param input - 无输入参数
 * @returns 无返回值
 * @throws {Error} 处理失败时抛出异常
 */
interface I18nStrings {
    emptyStateTitle: string;
    emptyStateText: string;
    zoomStatus: string;
    webviewTitle: string;
    copySuccess: string;
    copyCode: string;
    viewCode: string;
    viewPreview: string;
    previewError: string;
}

const supportedExtensions = [
    'Markdown (.md)',
    'LaTeX (.tex)',
    'Mermaid (.mmd / .mermaid)',
    'JSON (.json / .jsonc)',
    'YAML (.yaml / .yml)',
    'TOML (.toml)',
    'XML (.xml)',
    'CSV (.csv)',
    'TSV (.tsv)'
];

const supportedList = supportedExtensions.map(ext => `<li>${ext}</li>`).join('');

const strings: Record<string, I18nStrings> = {
    'en_US': {
        emptyStateTitle: 'Sidebar Previewer',
        emptyStateText: `Preview not supported for this file type.<br />Supported formats:<ul>${supportedList}</ul>`,
        zoomStatus: 'Sidebar Previewer Zoom: {0}%',
        webviewTitle: 'Sidebar Previewer',
        copySuccess: 'Copied',
        copyCode: 'Copy',
        viewCode: 'Code',
        viewPreview: 'Preview',
        previewError: 'Preview Failed'
    },
    'zh_CN': {
        emptyStateTitle: '文件预览',
        emptyStateText: `当前文件类型不支持预览，仅支持以下格式：<ul>${supportedList}</ul>`,
        zoomStatus: '预览缩放: {0}%',
        webviewTitle: '文件预览',
        copySuccess: '已复制',
        copyCode: '复制',
        viewCode: '代码',
        viewPreview: '预览',
        previewError: '预览失败'
    },
    'zh_TW': {
        emptyStateTitle: '檔案預覽',
        emptyStateText: `目前檔案類型不支援預覽，僅支援以下格式：<ul>${supportedList}</ul>`,
        zoomStatus: '預覽縮放: {0}%',
        webviewTitle: '檔案預覽',
        copySuccess: '已複製',
        copyCode: '複製',
        viewCode: '程式碼',
        viewPreview: '預覽',
        previewError: '預覽失敗'
    },
    'zh_HK': {
        emptyStateTitle: '檔案預覽',
        emptyStateText: `目前檔案類型不支援預覽，僅支援以下格式：<ul>${supportedList}</ul>`,
        zoomStatus: '預覽縮放: {0}%',
        webviewTitle: '檔案預覽',
        copySuccess: '已複製',
        copyCode: '複製',
        viewCode: '程式碼',
        viewPreview: '預覽',
        previewError: '預覽失敗'
    },
    'ja_JP': {
        emptyStateTitle: 'ファイルプレビュー',
        emptyStateText: `このファイル形式はプレビューに対応していません。対応形式：<ul>${supportedList}</ul>`,
        zoomStatus: 'プレビュー拡大率: {0}%',
        webviewTitle: 'ファイルプレビュー',
        copySuccess: 'コピー完了',
        copyCode: 'コピー',
        viewCode: 'コード',
        viewPreview: 'プレビュー',
        previewError: 'プレビュー失敗'
    }
};

type LocaleKey = keyof typeof strings;
const availableLocales = Object.keys(strings) as LocaleKey[];
let currentLocale: LocaleKey = 'en_US';

// 归一化语言区域标识以统一后续处理
function normalizeLocale(locale: string): string {
    return locale.replace('-', '_').toLowerCase();
}

const localeLookup = new Map<string, LocaleKey>(
    availableLocales.map(locale => [normalizeLocale(locale), locale])
);

// 处理i18n相关逻辑并返回结果
export function initI18n(): void {
    // 获取 VS Code 当前的显示语言
    const vscodeLanguage = normalizeLocale(vscode.env.language);

    const exactLocale = localeLookup.get(vscodeLanguage);
    if (exactLocale) {
        currentLocale = exactLocale;
        return;
    }

    // 尝试匹配语言前缀 (如 zh 匹配 zh_CN)
    const languagePrefix = vscodeLanguage.split('_')[0];
    const matchedLocale = availableLocales.find(
        locale => normalizeLocale(locale).split('_')[0] === languagePrefix
    );
    currentLocale = matchedLocale ?? 'en_US';
}

// 获取字符串并返回结果
function getString(key: keyof I18nStrings): string {
    return strings[currentLocale]?.[key] ?? strings['en_US'][key];
}

export const i18n = {
    get emptyStateTitle(): string {
        return getString('emptyStateTitle');
    },
    get emptyStateText(): string {
        return getString('emptyStateText');
    },
    get zoomStatus(): string {
        return getString('zoomStatus');
    },
    get webviewTitle(): string {
        return getString('webviewTitle');
    },
    get copySuccess(): string {
        return getString('copySuccess');
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

    // 处理当前场景相关逻辑并返回结果
    format(template: string, ...args: string[]): string {
        return template.replace(/{(\d+)}/g, (match, index) => {
            return args[index] ?? match;
        });
    }
};
