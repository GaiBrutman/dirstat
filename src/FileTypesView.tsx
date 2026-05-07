import { useState, useMemo } from "react";
import { FileNode } from "./types";
import {
  FileTypeStats, computeFileTypes, computeCategoryBreakdown,
  formatSize, collectLargeFiles, CATEGORY_COLORS,
} from "./utils";

interface FileTypesViewProps {
  root: FileNode;
  onSelectExtension: (stats: FileTypeStats, topFiles: FileNode[]) => void;
}

export function FileTypesView({ root, onSelectExtension }: FileTypesViewProps) {
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selectedExt, setSelectedExt] = useState<string | null>(null);

  const categories = useMemo(() => computeCategoryBreakdown(root), [root]);
  const allTypes    = useMemo(() => computeFileTypes(root), [root]);
  const allFiles    = useMemo(() => collectLargeFiles(root, 0), [root]);

  const filteredTypes = selectedCat
    ? allTypes.filter((s) => s.category === selectedCat)
    : allTypes;

  const totalSize = root.size || 1;
  const maxCatSize = Math.max(...categories.map((c) => c.size), 1);

  function handleExtClick(stats: FileTypeStats) {
    setSelectedExt(stats.extension);
    const topFiles = allFiles.filter((f) => {
      const ext = f.name.includes(".") ? f.name.split(".").pop()!.toLowerCase() : "(none)";
      return ext === stats.extension;
    }).slice(0, 5);
    onSelectExtension(stats, topFiles);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", padding: 12, gap: 12 }}>

      {/* Category breakdown */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)", marginBottom: 8 }}>
          By Category
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {categories.map((cat) => {
            const isSelected = selectedCat === cat.category;
            const barWidth = (cat.size / maxCatSize) * 100;
            return (
              <div
                key={cat.category}
                onClick={() => setSelectedCat(isSelected ? null : cat.category)}
                style={{ cursor: "pointer", padding: "6px 8px", borderRadius: 7, background: isSelected ? "var(--surface2)" : "transparent", transition: "background 80ms" }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--surface2)"; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: "var(--text)", fontWeight: 500 }}>{cat.label}</span>
                  <span style={{ color: "var(--text2)" }}>
                    {formatSize(cat.size)} · {((cat.size / totalSize) * 100).toFixed(1)}%
                  </span>
                </div>
                <div style={{ height: 4, background: "var(--surface2)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${barWidth}%`, background: cat.color, borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
        </div>
        {selectedCat && (
          <button onClick={() => setSelectedCat(null)} style={{ marginTop: 6, background: "none", border: "none", color: "var(--accent2)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
            ✕ Clear filter
          </button>
        )}
      </div>

      {/* Extension table */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "80px 90px 1fr 90px 70px", gap: "0 10px", padding: "4px 8px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          {["Extension", "Category", "Count", "Total Size", "% of Total"].map((h) => (
            <span key={h} style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text3)" }}>{h}</span>
          ))}
        </div>
        {filteredTypes.map((stats) => {
          const isSelected = stats.extension === selectedExt;
          const color = CATEGORY_COLORS[stats.category] ?? "#475569";
          return (
            <div
              key={stats.extension}
              onClick={() => handleExtClick(stats)}
              style={{
                display: "grid", gridTemplateColumns: "80px 90px 1fr 90px 70px", gap: "0 10px",
                padding: "6px 8px", borderRadius: 6, cursor: "pointer",
                background: isSelected ? "rgba(99,102,241,0.14)" : "transparent",
                outline: isSelected ? "1px solid var(--accent)" : "none",
                transition: "background 80ms",
              }}
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--surface2)"; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontFamily: "'SF Mono','Fira Code',monospace", fontSize: 12, color: "var(--text)", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: color, flexShrink: 0, display: "inline-block" }} />
                .{stats.extension}
              </span>
              <span style={{ fontSize: 11, color: "var(--text2)", alignSelf: "center" }}>
                {stats.category.charAt(0).toUpperCase() + stats.category.slice(1)}
              </span>
              <span style={{ fontSize: 11, color: "var(--text3)", alignSelf: "center" }}>
                {stats.count.toLocaleString()}
              </span>
              <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 600, alignSelf: "center" }}>
                {formatSize(stats.totalSize)}
              </span>
              <span style={{ fontSize: 11, color: "var(--text3)", alignSelf: "center" }}>
                {((stats.totalSize / totalSize) * 100).toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
