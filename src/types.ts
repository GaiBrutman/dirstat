export interface FileNode {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  children: FileNode[];
  file_count: number;
}

export interface DuplicateFile {
  path: string;
  modified: number; // Unix timestamp seconds
}

export interface DuplicateGroup {
  hash: string;
  size: number;
  total_wasted: number;
  files: DuplicateFile[];
}

export interface ScanStats {
  totalSize: number;
  fileCount: number;
  folderCount: number;
  durationMs: number;
}

export type AppTab = "overview" | "large-files" | "duplicates" | "file-types";
export type OverviewSubView = "treemap" | "tree";
