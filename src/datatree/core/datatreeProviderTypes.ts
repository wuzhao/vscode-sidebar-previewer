export interface KeyLineLocator {
    next(key: string, parentPath?: string[]): number;
}

export interface ArrayItemLineLocator {
    next(): number;
}

export interface JsonCloseLineLocator {
    next(line: number): number;
}

export interface YamlCloseLineLocator {
    next(line: number): number;
}

export interface XmlCloseLineLocator {
    next(line: number): number;
}

export interface XmlTagMatch {
    tagName: string;
    attributesSource: string;
}

export interface XmlDtdDirective {
    key: string;
    value: string;
}

export interface XmlDtdBlock {
    doctype: XmlDtdDirective | null;
    directives: XmlDtdDirective[];
}

export interface XmlCommentScanState {
    inComment: boolean;
    parts: string[];
}

export interface XmlLineCommentScanResult {
    nonCommentText: string;
    comments: string[];
}

export type CommentMarker = '/' | '*' | '#' | '-';

export interface CommentEntry {
    marker: CommentMarker;
    text: string;
}

export type CommentLineIndex = Map<number, CommentEntry[]>;

export interface StandaloneCommentGroup {
    line: number;
    comments: CommentEntry[];
    rootOnly?: boolean;
}

export interface StandaloneCommentCursor {
    groups: StandaloneCommentGroup[];
    index: number;
}

export interface CommentMetadata {
    lineComments: CommentLineIndex;
    standaloneGroups: StandaloneCommentGroup[];
}
