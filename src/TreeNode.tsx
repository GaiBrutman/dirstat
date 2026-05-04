import { useState } from "react";
import { FileNode } from "./types";
import { formatSize } from "./utils";

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  searchQuery?: string;
}

export function TreeNode({ node, depth, selectedPath, onSelect, searchQuery = "" }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth === 0);

  const isSelected = node.path === selectedPath;
  const indentStyle = { paddingLeft: `${depth * 1}rem` };

  function handleRowClick() {
    onSelect(node.path);
    if (node.is_dir) {
      setExpanded((prev) => !prev);
    }
  }

  function renderName(name: string) {
    if (!searchQuery) return <span className="truncate flex-1 text-gray-100">{name}</span>;
    const idx = name.toLowerCase().indexOf(searchQuery.toLowerCase());
    if (idx === -1) return <span className="truncate flex-1 text-gray-100">{name}</span>;
    return (
      <span className="truncate flex-1 text-gray-100">
        {name.slice(0, idx)}
        <mark style={{ background: "#854d0e", color: "#fef08a", borderRadius: "2px", padding: "0 1px" }}>
          {name.slice(idx, idx + searchQuery.length)}
        </mark>
        {name.slice(idx + searchQuery.length)}
      </span>
    );
  }

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-2 py-0.5 rounded cursor-pointer text-sm transition-colors ${
          isSelected
            ? "bg-blue-900/50 ring-1 ring-inset ring-blue-500"
            : "hover:bg-gray-800"
        }`}
        style={indentStyle}
        onClick={handleRowClick}
      >
        {node.is_dir ? (
          <>
            <span className="text-gray-400 w-3 shrink-0 text-xs">
              {expanded ? "▼" : "▶"}
            </span>
            <span className="shrink-0">📁</span>
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <span className="shrink-0">📄</span>
          </>
        )}

        {renderName(node.name)}

        <span className="text-xs text-gray-400 shrink-0">
          {formatSize(node.size)}
          {node.is_dir && node.file_count > 0 && (
            <span className="ml-2">{node.file_count.toLocaleString()} files</span>
          )}
        </span>
      </div>

      {node.is_dir && expanded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
}
