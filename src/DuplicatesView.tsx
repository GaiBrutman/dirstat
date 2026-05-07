import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileNode, DuplicateGroup } from "./types";
import { formatSize } from "./utils";

interface DuplicatesViewProps {
  scanPath: string;
  scanResult: FileNode | null;
  onSelectGroup: (group: DuplicateGroup) => void;
  onMoveToTrash: (path: string) => void;
}

export function DuplicatesView({ scanPath, scanResult, onSelectGroup, onMoveToTrash }: DuplicatesViewProps) {
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);

  const totalWasted = groups?.reduce((s, g) => s + g.total_wasted, 0) ?? 0;

  async function handleFind() {
    if (!scanResult) return;
    setLoading(true);
    setError(null);
    setGroups(null);
    try {
      const result = await invoke<DuplicateGroup[]>("find_duplicates", { path: scanPath });
      setGroups(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  if (!scanResult) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text3)", fontSize: 13 }}>
        Scan a directory first
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", padding: 12, gap: 10 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button
          onClick={handleFind}
          disabled={loading}
          style={{
            padding: "7px 18px", borderRadius: 8, border: "none",
            background: loading ? "rgba(99,102,241,0.45)" : "var(--accent)",
            color: "#fff", fontSize: 13, fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}
        >
          {loading ? "Scanning for duplicates…" : groups === null ? "Find Duplicates" : "Rescan"}
        </button>
        {groups !== null && !loading && (
          <span style={{ fontSize: 12, color: "var(--text2)" }}>
            {groups.length} duplicate {groups.length === 1 ? "group" : "groups"}
            {totalWasted > 0 && ` · ${formatSize(totalWasted)} reclaimable`}
          </span>
        )}
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--accent2)", flexShrink: 0 }}>
          <div style={{ width: 12, height: 12, border: "2px solid rgba(99,102,241,0.3)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
          Hashing files…
        </div>
      )}

      {error && (
        <div style={{ background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "var(--danger)", flexShrink: 0 }}>
          {error}
        </div>
      )}

      {groups !== null && groups.length === 0 && !loading && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text3)", fontSize: 13 }}>
          No duplicate files found
        </div>
      )}

      {/* Group list */}
      {groups && groups.length > 0 && (
        <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {groups.map((group) => {
            const fileName = group.files[0]?.path.split("/").pop() ?? "Unknown";
            const isSelected = group.hash === selectedHash;
            return (
              <div
                key={group.hash}
                onClick={() => { setSelectedHash(group.hash); onSelectGroup(group); }}
                style={{
                  borderRadius: 8, border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                  background: isSelected ? "rgba(99,102,241,0.08)" : "var(--surface2)",
                  padding: "10px 12px", cursor: "pointer", transition: "border-color 100ms",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>
                    {fileName}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--warning)", fontWeight: 700, flexShrink: 0 }}>
                    {formatSize(group.total_wasted)} wasted
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 8 }}>
                  {group.files.length} copies · {formatSize(group.size)} each
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {group.files.map((f, i) => (
                    <div key={f.path} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: i === 0 ? "var(--success)" : "var(--text3)",
                        width: 40, flexShrink: 0,
                      }}>
                        {i === 0 ? "KEEP" : `COPY ${i}`}
                      </span>
                      <span style={{
                        flex: 1, fontSize: 10, color: "var(--text3)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        fontFamily: "'SF Mono','Fira Code',monospace",
                      }} title={f.path}>
                        {f.path}
                      </span>
                      {i > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveToTrash(f.path);
                            setGroups(prev => prev ? prev.map(g =>
                              g.hash === group.hash
                                ? { ...g, files: g.files.filter(x => x.path !== f.path), total_wasted: g.size * (g.files.length - 2) }
                                : g
                            ).filter(g => g.files.length > 1) : prev);
                          }}
                          style={{ background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)", color: "var(--danger)", borderRadius: 5, padding: "2px 8px", fontSize: 10, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
                        >Delete</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
