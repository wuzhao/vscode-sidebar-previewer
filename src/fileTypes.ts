// 文件预览类型
export type FileType = 'markdown' | 'latex' | 'mermaid' | 'json' | 'jsonl' | 'yaml' | 'toml' | 'xml' | 'csv' | 'tsv';

/**
 * 标题/节点信息（用于定位）
 */
export interface HeadingInfo {
    level: number;
    text: string;
    line: number;
    id: string;
}

/**
 * 预览结果
 */
export interface PreviewResult {
    // 渲染后的 HTML
    html: string;
    // 文件类型
    fileType: FileType;
    // 是否支持跟随定位（基于标题）
    supportsLocate: boolean;
    // 标题/节点信息（用于定位）
    headings?: HeadingInfo[];
    // 是否需要客户端渲染（如 KaTeX、Mermaid）
    clientRender?: 'katex' | 'mermaid';
}

/**
 * 支持的文件扩展名映射
 */
interface FileTypeCapabilities {
    label: string;
    extensions: readonly string[];
    supportsLocate: boolean;
    isDataTree: boolean;
}

// 定义各文件类型的扩展名和预览能力映射
const FILE_TYPE_CAPABILITIES: Record<FileType, FileTypeCapabilities> = {
    markdown: {
        label: 'Markdown',
        extensions: ['.md', '.markdown'],
        supportsLocate: true,
        isDataTree: false,
    },
    latex: {
        label: 'LaTeX',
        extensions: ['.tex', '.katex', '.latex'],
        supportsLocate: true,
        isDataTree: false,
    },
    mermaid: {
        label: 'Mermaid',
        extensions: ['.mmd', '.mermaid'],
        supportsLocate: false,
        isDataTree: false,
    },
    json: {
        label: 'JSON',
        extensions: ['.json', '.jsonc'],
        supportsLocate: false,
        isDataTree: true,
    },
    jsonl: {
        label: 'JSONL',
        extensions: ['.jsonl'],
        supportsLocate: false,
        isDataTree: true,
    },
    yaml: {
        label: 'YAML',
        extensions: ['.yaml', '.yml'],
        supportsLocate: false,
        isDataTree: true,
    },
    toml: {
        label: 'TOML',
        extensions: ['.toml'],
        supportsLocate: false,
        isDataTree: true,
    },
    xml: {
        label: 'XML',
        extensions: ['.xml'],
        supportsLocate: false,
        isDataTree: true,
    },
    csv: {
        label: 'CSV',
        extensions: ['.csv'],
        supportsLocate: true,
        isDataTree: false,
    },
    tsv: {
        label: 'TSV',
        extensions: ['.tsv'],
        supportsLocate: true,
        isDataTree: false,
    },
};

// 构建扩展名到文件类型的快速查找表
const EXTENSION_TO_TYPE_MAP: Map<string, FileType> = new Map(
    (Object.entries(FILE_TYPE_CAPABILITIES) as [FileType, FileTypeCapabilities][])
        .flatMap(([type, capabilities]) => capabilities.extensions.map(ext => [ext, type] as const))
);

/**
 * 根据文件名后缀识别对应的预览类型
 * @param fileName - 待识别的文件名或完整路径
 * @returns 返回匹配的文件类型，不支持时返回 null
 */
export function getFileType(fileName: string): FileType | null {
    if (!fileName) {
        return null;
    }
    const lowerName = fileName.toLowerCase();
    for (const [ext, type] of EXTENSION_TO_TYPE_MAP.entries()) {
        if (lowerName.endsWith(ext)) {
            return type;
        }
    }
    return null;
}

/**
 * 判断文件类型是否支持编辑器与预览之间的定位
 * @param fileType - 当前文件类型
 * @returns 返回该类型是否支持定位
 */
export function supportsLocate(fileType: FileType): boolean {
    return FILE_TYPE_CAPABILITIES[fileType].supportsLocate;
}

/**
 * 判断文件类型是否使用数据树预览
 * @param fileType - 当前文件类型
 * @returns 返回该类型是否属于数据树
 */
export function isDataTreeType(fileType: FileType): boolean {
    return FILE_TYPE_CAPABILITIES[fileType].isDataTree;
}

/**
 * 获取全部数据树文件类型供宿主端与 Webview 共享
 * @returns 返回按配置顺序排列的数据树文件类型
 */
export function getDataTreeFileTypes(): FileType[] {
    return (Object.keys(FILE_TYPE_CAPABILITIES) as FileType[])
        .filter(fileType => FILE_TYPE_CAPABILITIES[fileType].isDataTree);
}

/**
 * 获取空状态中展示的受支持格式标签
 * @returns 返回包含格式名称与扩展名的展示文本
 */
export function getSupportedExtensionLabels(): string[] {
    return (Object.values(FILE_TYPE_CAPABILITIES) as FileTypeCapabilities[])
        .map(capabilities => `${capabilities.label} (${capabilities.extensions.join(' / ')})`);
}
