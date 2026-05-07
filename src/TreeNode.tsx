import { useState } from "react";
import { FileNode } from "./types";
import { formatSize } from "./utils";

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
  searchQuery?: string;
}

export function TreeNode({ node, depth, selectedPath, onSelect, searchQuery = "" }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth === 0);

  const isSelected = node.path === selectedPath;

  function handleRowClick() {
    onSelect(node.path);
    if (node.is_dir) {
      setExpanded((prev) => !prev);
    }
  }

  function renderName(name: string) {
    if (!searchQuery) return <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>{name}</span>;
    const idx = name.toLowerCase().indexOf(searchQuery.toLowerCase());
    if (idx === -1) return <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>{name}</span>;
    return (
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>
        {name.slice(0, idx)}
        <mark style={{ background: "rgba(251,191,36,0.25)", color: "var(--warning)", borderRadius: 2, padding: "0 1px" }}>
          {name.slice(idx, idx + searchQuery.length)}
        </mark>
        {name.slice(idx + searchQuery.length)}
      </span>
    );
  }

  return (
    <div>
      <div
        onClick={handleRowClick}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "2px 8px", borderRadius: 5, cursor: "pointer", fontSize: 13,
          paddingLeft: `${depth}rem`,
          background: isSelected ? "rgba(99,102,241,0.18)" : "transparent",
          outline: isSelected ? "1px solid var(--accent)" : "none",
          outlineOffset: -1,
          color: "var(--text)",
          transition: "background 80ms",
        }}
        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--surface2)"; }}
        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
      >
        {node.is_dir ? (
          <>
            <span style={{ color: "var(--text3)", width: 12, flexShrink: 0, fontSize: 10 }}>
              {expanded ? "▼" : "▶"}
            </span>
            <span style={{ flexShrink: 0 }}>📁</span>
          </>
        ) : (
          <>
            <span style={{ width: 12, flexShrink: 0 }} />
            <span style={{ flexShrink: 0 }}>📄</span>
          </>
        )}

        {renderName(node.name)}

        <span style={{ fontSize: 11, color: "var(--text2)", flexShrink: 0 }}>
          {formatSize(node.size)}
          {node.is_dir && node.file_count > 0 && (
            <span style={{ marginLeft: 8 }}>{node.file_count.toLocaleString()} files</span>
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
