// 文件预览类型
export type FileType = 'markdown' | 'latex' | 'mermaid' | 'json' | 'yaml' | 'toml' | 'xml' | 'csv' | 'tsv';

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
    extensions: readonly string[];
    supportsLocate: boolean;
    isDataTree: boolean;
}

// 定义各文件类型的扩展名和预览能力映射
const FILE_TYPE_CAPABILITIES: Record<FileType, FileTypeCapabilities> = {
    markdown: {
        extensions: ['.md', '.markdown'],
        supportsLocate: true,
        isDataTree: false,
    },
    latex: {
        extensions: ['.tex'],
        supportsLocate: true,
        isDataTree: false,
    },
    mermaid: {
        extensions: ['.mmd', '.mermaid'],
        supportsLocate: false,
        isDataTree: false,
    },
    json: {
        extensions: ['.json', '.jsonc'],
        supportsLocate: false,
        isDataTree: true,
    },
    yaml: {
        extensions: ['.yaml', '.yml'],
        supportsLocate: false,
        isDataTree: true,
    },
    toml: {
        extensions: ['.toml'],
        supportsLocate: false,
        isDataTree: true,
    },
    xml: {
        extensions: ['.xml'],
        supportsLocate: false,
        isDataTree: true,
    },
    csv: {
        extensions: ['.csv'],
        supportsLocate: false,
        isDataTree: false,
    },
    tsv: {
        extensions: ['.tsv'],
        supportsLocate: false,
        isDataTree: false,
    },
};

// 构建扩展名到文件类型的快速查找表
const EXTENSION_TO_TYPE_MAP: Map<string, FileType> = new Map(
    (Object.entries(FILE_TYPE_CAPABILITIES) as [FileType, FileTypeCapabilities][])
        .flatMap(([type, capabilities]) => capabilities.extensions.map(ext => [ext, type] as const))
);

// 根据文件名获取文件类型
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

// 判断文件类型是否支持跟随定位
export function supportsLocate(fileType: FileType): boolean {
    return FILE_TYPE_CAPABILITIES[fileType].supportsLocate;
}

// 判断文件类型是否为数据树形类型
export function isDataTreeType(fileType: FileType): boolean {
    return FILE_TYPE_CAPABILITIES[fileType].isDataTree;
}
