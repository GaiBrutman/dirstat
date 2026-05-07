import { useState, useMemo } from "react";
import { FileNode } from "./types";
import { collectLargeFiles, formatSize, getFileCategory, CATEGORY_COLORS } from "./utils";

const SIZE_PRESETS = [
  { label: "All sizes",  bytes: 0 },
  { label: "> 10 MB",   bytes: 10_000_000 },
  { label: "> 100 MB",  bytes: 100_000_000 },
  { label: "> 500 MB",  bytes: 500_000_000 },
  { label: "> 1 GB",    bytes: 1_000_000_000 },
];

type SortKey = "size" | "name" | "type";

interface LargeFilesViewProps {
  root: FileNode;
  onSelect: (node: FileNode) => void;
  onOpenInFinder: (path: string) => void;
  onMoveToTrash: (path: string) => void;
}

export function LargeFilesView({ root, onSelect, onOpenInFinder, onMoveToTrash }: LargeFilesViewProps) {
  const [minBytes, setMinBytes] = useState(100_000_000);
  const [sortKey, setSortKey] = useState<SortKey>("size");
  const [search, setSearch] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const files = useMemo(() => {
    let list = collectLargeFiles(root, minBytes);
    if (search) list = list.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
    if (sortKey === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sortKey === "type") list = [...list].sort((a, b) => getFileCategory(a).localeCompare(getFileCategory(b)));
    return list;
  }, [root, minBytes, sortKey, search]);

  const select = (node: FileNode) => {
    setSelectedPath(node.path);
    onSelect(node);
  };

  const labelStyle: React.CSSProperties = { fontSize: 11, color: "var(--text3)", flexShrink: 0 };
  const selectStyle: React.CSSProperties = {
    background: "var(--surface2)", border: "1px solid var(--border2)", borderRadius: 7,
    padding: "5px 10px", fontSize: 12, color: "var(--text)", cursor: "pointer", fontFamily: "inherit",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", padding: 12, gap: 10 }}>
      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
        <span style={labelStyle}>Min size:</span>
        <select value={minBytes} onChange={(e) => setMinBytes(Number(e.target.value))} style={selectStyle}>
          {SIZE_PRESETS.map(p => (
            <option key={p.bytes} value={p.bytes}>{p.label}</option>
          ))}
        </select>
        <span style={labelStyle}>Sort:</span>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} style={selectStyle}>
          <option value="size">Size</option>
          <option value="name">Name</option>
          <option value="type">Type</option>
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setSearch("")}
          placeholder="Search…"
          style={{
            flex: 1, minWidth: 120, background: "var(--surface2)", border: "1px solid var(--border2)",
            borderRadius: 7, padding: "5px 10px", fontSize: 12, color: "var(--text)",
            outline: "none", fontFamily: "inherit",
          }}
        />
        <span style={labelStyle}>{files.length.toLocaleString()} files</span>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {files.length === 0 && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text3)", fontSize: 13 }}>
            No files found matching the current filters
          </div>
        )}
        {files.map((node) => {
          const cat = getFileCategory(node);
          const isSelected = node.path === selectedPath;
          return (
            <div
              key={node.path}
              onClick={() => select(node)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 7,
                background: isSelected ? "rgba(99,102,241,0.14)" : "transparent",
                outline: isSelected ? "1px solid var(--accent)" : "none",
                cursor: "pointer", transition: "background 80ms",
              }}
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--surface2)"; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: CATEGORY_COLORS[cat] }} />
              <span style={{ fontWeight: 500, color: "var(--text)", flexShrink: 0, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {node.name}
              </span>
              <span style={{ flex: 1, fontSize: 11, color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'SF Mono','Fira Code',monospace" }}
                title={node.path}>
                {node.path.split("/").slice(0, -1).join("/")}
              </span>
              <span style={{ fontSize: 12, color: "var(--text2)", fontWeight: 600, flexShrink: 0 }}>
                {formatSize(node.size)}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onOpenInFinder(node.path); }}
                style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 13, padding: "0 2px", flexShrink: 0 }}
                title="Show in Finder"
              >🔍</button>
              <button
                onClick={(e) => { e.stopPropagation(); onMoveToTrash(node.path); }}
                style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 13, padding: "0 2px", flexShrink: 0 }}
                title="Move to Trash"
              >🗑</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
