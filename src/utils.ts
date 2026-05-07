import { FileNode } from "./types";

export function formatSize(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB";
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + " KB";
  return bytes + " B";
}

export function filterTree(node: FileNode, query: string): FileNode | null {
  const q = query.toLowerCase();
  if (!node.is_dir) {
    return node.name.toLowerCase().includes(q) ? node : null;
  }
  const nameMatches = node.name.toLowerCase().includes(q);
  const filteredChildren = node.children
    .map((child) => filterTree(child, query))
    .filter((c): c is FileNode => c !== null);
  if (nameMatches || filteredChildren.length > 0) {
    return { ...node, children: filteredChildren };
  }
  return null;
}

export function countLeaves(node: FileNode): number {
  if (!node.is_dir) return 1;
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

export function countNodes(node: FileNode): number {
  if (!node.is_dir) return 1;
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

export function removeAndRecalc(root: FileNode, removePath: string): FileNode | null {
  if (root.path === removePath) return null;
  const newChildren = root.children
    .map(c => removeAndRecalc(c, removePath))
    .filter((c): c is FileNode => c !== null);
  if (!root.is_dir) return root;
  const size = newChildren.reduce((s, c) => s + c.size, 0);
  const file_count = newChildren.reduce((s, c) => s + (c.is_dir ? c.file_count : 1), 0);
  return { ...root, children: newChildren, size, file_count };
}

export function replaceNode(root: FileNode, newNode: FileNode): FileNode {
  if (root.path === newNode.path) return newNode;
  if (!root.is_dir) return root;
  const newChildren = root.children.map(c => replaceNode(c, newNode));
  const size = newChildren.reduce((s, c) => s + c.size, 0);
  const file_count = newChildren.reduce((s, c) => s + (c.is_dir ? c.file_count : 1), 0);
  return { ...root, children: newChildren, size, file_count };
}

// ── Category helpers (shared with Treemap, Inspector, FileTypesView) ──

const EXT_IMAGE = new Set(["jpg","jpeg","png","gif","svg","webp","ico","bmp","avif","heic","tiff"]);
const EXT_VIDEO = new Set(["mp4","mov","avi","mkv","wmv","flv","webm","m4v","mpg"]);
const EXT_AUDIO = new Set(["mp3","wav","flac","aac","ogg","m4a","opus","wma"]);
const EXT_CODE  = new Set(["ts","tsx","js","jsx","py","rs","go","java","cpp","c","h","cs","rb","php","swift","kt","html","css","scss","json","yaml","yml","toml","xml","sh","bash"]);
const EXT_DOC   = new Set(["pdf","doc","docx","txt","md","rtf","xls","xlsx","ppt","pptx","csv","epub"]);
const EXT_ARC   = new Set(["zip","tar","gz","rar","7z","bz2","xz","dmg","iso","pkg","deb","rpm"]);

export function getFileCategory(node: FileNode): string {
  if (node.is_dir) return "directory";
  const ext = node.name.split(".").pop()?.toLowerCase() ?? "";
  if (EXT_IMAGE.has(ext)) return "image";
  if (EXT_VIDEO.has(ext)) return "video";
  if (EXT_AUDIO.has(ext)) return "audio";
  if (EXT_CODE.has(ext))  return "code";
  if (EXT_DOC.has(ext))   return "document";
  if (EXT_ARC.has(ext))   return "archive";
  return "other";
}

export const CATEGORY_COLORS: Record<string, string> = {
  directory: "#2563eb", image: "#d97706", video: "#dc2626", audio: "#ea580c",
  code: "#7c3aed", document: "#16a34a", archive: "#0d9488", other: "#475569",
};

export const CATEGORY_LABELS: Record<string, string> = {
  directory: "Folders", image: "Images", video: "Video", audio: "Audio",
  code: "Code", document: "Documents", archive: "Archives", other: "Other",
};

// ── Large Files ──

export function collectLargeFiles(root: FileNode, minBytes: number): FileNode[] {
  const result: FileNode[] = [];
  function walk(node: FileNode) {
    if (!node.is_dir) {
      if (node.size >= minBytes) result.push(node);
    } else {
      for (const child of node.children) walk(child);
    }
  }
  walk(root);
  result.sort((a, b) => b.size - a.size);
  return result;
}

// ── File Type Analytics ──

export interface FileTypeStats {
  extension: string;
  category: string;
  count: number;
  totalSize: number;
}

export function computeFileTypes(root: FileNode): FileTypeStats[] {
  const map = new Map<string, { category: string; count: number; totalSize: number }>();
  function walk(node: FileNode) {
    if (!node.is_dir) {
      const ext = node.name.includes(".") ? node.name.split(".").pop()!.toLowerCase() : "(none)";
      const category = getFileCategory(node);
      const entry = map.get(ext) ?? { category, count: 0, totalSize: 0 };
      map.set(ext, { ...entry, count: entry.count + 1, totalSize: entry.totalSize + node.size });
    } else {
      for (const child of node.children) walk(child);
    }
  }
  walk(root);
  return Array.from(map.entries())
    .map(([extension, d]) => ({ extension, ...d }))
    .sort((a, b) => b.totalSize - a.totalSize);
}

export interface CategoryBreakdown {
  category: string;
  label: string;
  color: string;
  size: number;
  count: number;
}

export function computeCategoryBreakdown(root: FileNode): CategoryBreakdown[] {
  const map = new Map<string, { size: number; count: number }>();
  function walk(node: FileNode) {
    if (!node.is_dir) {
      const cat = getFileCategory(node);
      const entry = map.get(cat) ?? { size: 0, count: 0 };
      map.set(cat, { size: entry.size + node.size, count: entry.count + 1 });
    } else {
      for (const child of node.children) walk(child);
    }
  }
  walk(root);
  return Array.from(map.entries())
    .map(([category, d]) => ({
      category,
      label: CATEGORY_LABELS[category] ?? category,
      color: CATEGORY_COLORS[category] ?? "#475569",
      ...d,
    }))
    .sort((a, b) => b.size - a.size);
}
