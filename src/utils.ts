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
