export interface FileNode {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  children: FileNode[];
  file_count: number;
}
