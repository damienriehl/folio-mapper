export type ParseFormat = 'flat' | 'hierarchical' | 'text_single' | 'text_multi';

export interface ParseItem {
  text: string;
  index: number;
  ancestry: string[];
}

export interface HierarchyNode {
  label: string;
  depth: number;
  children: HierarchyNode[];
}

export interface ParseResult {
  format: ParseFormat;
  items: ParseItem[];
  hierarchy: HierarchyNode[] | null;
  total_items: number;
  headers: string[] | null;
  source_filename: string | null;
  raw_preview: string[][] | null;
}

export type Screen = 'input' | 'confirming' | 'mapping';
