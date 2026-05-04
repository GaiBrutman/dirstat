import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TreeNode } from "./TreeNode";
import { TreemapView } from "./Treemap";
import { ContextMenu } from "./ContextMenu";
import { FileNode } from "./types";
import { filterTree, countNodes, removeAndRecalc, replaceNode } from "./utils";

type View = "treemap" | "tree";

interface ScanProgress {
  count: number;
  current_path: string;
}

const S = {
  app: {
    display: "grid",
    gridTemplateRows: "auto auto 1fr",
    height: "100vh",
    overflow: "hidden",
    background: "#09090b",
    color: "#e4e4e7",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    padding: "18px 22px 18px 22px",
    gap: "14px",
    boxSizing: "border-box" as const,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  logoIcon: {
    width: "30px",
    height: "30px",
    background: "linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "15px",
    flexShrink: 0,
  },
  logoText: {
    fontSize: "15px",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: "#fafafa",
  },
  viewToggle: {
    display: "flex",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "9px",
    padding: "3px",
    gap: "2px",
  },
  scanRow: {
    display: "flex",
    gap: "10px",
  },
  input: {
    flex: 1,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "10px",
    padding: "9px 14px",
    fontSize: "13px",
    color: "#f4f4f5",
    outline: "none",
    fontFamily: "inherit",
  },
  button: (active: boolean) => ({
    padding: "9px 22px",
    borderRadius: "10px",
    border: "none",
    background: active ? "#3b82f6" : "rgba(59,130,246,0.45)",
    color: "#fff",
    fontSize: "13px",
    fontWeight: 600,
    cursor: active ? "pointer" : "not-allowed",
    fontFamily: "inherit",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  }),
  cancelButton: {
    padding: "9px 18px",
    borderRadius: "10px",
    border: "1px solid rgba(239,68,68,0.35)",
    background: "rgba(239,68,68,0.12)",
    color: "#fca5a5",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  contentCell: {
    minHeight: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
  },
  errorBox: {
    background: "rgba(239,68,68,0.10)",
    border: "1px solid rgba(239,68,68,0.25)",
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "13px",
    color: "#fca5a5",
    flexShrink: 0,
  },
  cancelledBox: {
    background: "rgba(234,179,8,0.10)",
    border: "1px solid rgba(234,179,8,0.25)",
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "13px",
    color: "#fde047",
    flexShrink: 0,
  },
  progressBox: {
    background: "rgba(59,130,246,0.08)",
    border: "1px solid rgba(59,130,246,0.20)",
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "12px",
    color: "#93c5fd",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  spinner: {
    width: "14px",
    height: "14px",
    border: "2px solid rgba(59,130,246,0.3)",
    borderTopColor: "#3b82f6",
    borderRadius: "50%",
    flexShrink: 0,
    animation: "spin 0.7s linear infinite",
  },
  progressText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  treeWrap: {
    flex: 1,
    minHeight: 0,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: "10px",
    padding: "8px",
    overflow: "auto",
  },
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    color: "#52525b",
  },
  emptyIcon: {
    fontSize: "48px",
    lineHeight: 1,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: "15px",
    fontWeight: 600,
    color: "#71717a",
  },
  emptyHint: {
    fontSize: "12px",
    color: "#3f3f46",
  },
  searchRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "10px",
    padding: "7px 14px",
    fontSize: "13px",
    color: "#f4f4f5",
    outline: "none",
    fontFamily: "inherit",
  },
  clearButton: {
    padding: "7px 12px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "#a1a1aa",
    fontSize: "13px",
    cursor: "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
  },
  matchCount: {
    fontSize: "12px",
    color: "#71717a",
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
  },
  noMatches: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
    color: "#52525b",
  },
  actionBar: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 12px",
    background: "rgba(59,130,246,0.06)",
    border: "1px solid rgba(59,130,246,0.15)",
    borderRadius: "10px",
    flexShrink: 0,
  },
  actionPath: {
    flex: 1,
    fontSize: "12px",
    color: "#71717a",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  actionBtn: (color: string) => ({
    padding: "5px 12px",
    borderRadius: "7px",
    border: `1px solid ${color}33`,
    background: `${color}11`,
    color: color,
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
    whiteSpace: "nowrap" as const,
  }),
} as const;

function ViewToggleBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 14px",
        borderRadius: "6px",
        border: "none",
        background: active ? "rgba(255,255,255,0.13)" : "transparent",
        color: active ? "#f4f4f5" : "#71717a",
        fontSize: "12px",
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

export default function App() {
  const [path, setPath] = useState("/");
  const [result, setResult] = useState<FileNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [view, setView] = useState<View>("treemap");
  const [searchQuery, setSearchQuery] = useState("");
  const [drillRequest, setDrillRequest] = useState<string | null>(null);
  const [treemapSearch, setTreemapSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null);

  const displayTree: FileNode | null = result
    ? searchQuery
      ? filterTree(result, searchQuery)
      : result
    : null;

  const selectedNode = useCallback((): FileNode | null => {
    if (!result || !selectedPath) return null;
    function find(node: FileNode): FileNode | null {
      if (node.path === selectedPath) return node;
      for (const child of node.children) {
        const found = find(child);
        if (found) return found;
      }
      return null;
    }
    return find(result);
  }, [result, selectedPath])();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && loading) {
        invoke("cancel_scan");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loading]);

  async function handleScan(scanPath?: string) {
    const target = scanPath ?? path;
    if (loading) return;
    setLoading(true);
    setError(null);
    setCancelled(false);
    if (!scanPath) {
      setResult(null);
      setSelectedPath(null);
    }
    setProgress(null);

    const unlisten = await listen<ScanProgress>("scan_progress", (event) => {
      setProgress(event.payload);
    });

    try {
      const data = await invoke<FileNode>("scan", { path: target });
      if (scanPath && result) {
        setResult(replaceNode(result, data));
      } else {
        setResult(data);
        await getCurrentWindow().setTitle(`DirStat — ${target}`);
      }
    } catch (err) {
      const msg = String(err);
      if (msg === "cancelled") {
        setCancelled(true);
      } else {
        setError(msg);
      }
    } finally {
      unlisten();
      setLoading(false);
      setProgress(null);
      if (!scanPath) {
        setSearchQuery("");
        setTreemapSearch("");
      }
    }
  }

  async function handleCancel() {
    await invoke("cancel_scan");
  }

  async function handleOpenInExplorer() {
    if (!selectedPath) return;
    await invoke("open_in_explorer", { path: selectedPath });
  }

  async function handleMoveToTrash() {
    if (!selectedPath || !result) return;
    const confirmed = window.confirm(`Move "${selectedNode?.name}" to Trash?`);
    if (!confirmed) return;
    try {
      await invoke("move_to_trash", { path: selectedPath });
      const newTree = removeAndRecalc(result, selectedPath);
      setResult(newTree);
      setSelectedPath(null);
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleRescan() {
    if (!selectedPath || !selectedNode?.is_dir) return;
    await handleScan(selectedPath);
  }

  function handleContextMenu(e: React.MouseEvent, node: FileNode) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }

  return (
    <div style={S.app}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Header ── */}
      <header style={S.header}>
        <div style={S.logo}>
          <div style={S.logoIcon}>📊</div>
          <span style={S.logoText}>DirStat</span>
        </div>
        {result && !loading && (
          <div style={S.viewToggle}>
            <ViewToggleBtn label="Treemap" active={view === "treemap"} onClick={() => setView("treemap")} />
            <ViewToggleBtn label="Tree"    active={view === "tree"}    onClick={() => setView("tree")} />
          </div>
        )}
      </header>

      {/* ── Scan bar ── */}
      <div style={S.scanRow}>
        <input
          style={S.input}
          type="text"
          value={path}
          onChange={e => setPath(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !loading && handleScan()}
          onFocus={e => (e.currentTarget.style.borderColor = "#3b82f6")}
          onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)")}
          placeholder="Directory path…"
          disabled={loading}
          spellCheck={false}
        />
        {result && !loading && view === "treemap" && (
          <div style={{ position: "relative", display: "flex", alignItems: "center", flexShrink: 0 }}>
            <input
              type="text"
              value={treemapSearch}
              onChange={e => setTreemapSearch(e.target.value)}
              onKeyDown={e => e.key === "Escape" && setTreemapSearch("")}
              onFocus={e => (e.currentTarget.style.borderColor = "#3b82f6")}
              onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)")}
              placeholder="Filter by name…"
              spellCheck={false}
              style={{
                width: "150px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: "10px",
                padding: "9px 32px 9px 12px",
                fontSize: "13px",
                color: "#f4f4f5",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            {treemapSearch && (
              <button
                onClick={() => setTreemapSearch("")}
                style={{
                  position: "absolute",
                  right: "8px",
                  background: "none",
                  border: "none",
                  color: "#71717a",
                  cursor: "pointer",
                  fontSize: "14px",
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
        )}
        <button style={S.button(!loading)} onClick={() => handleScan()} disabled={loading}>
          Scan
        </button>
        {loading && (
          <button style={S.cancelButton} onClick={handleCancel}>
            Cancel
          </button>
        )}
      </div>

      {/* ── Content ── */}
      <div style={S.contentCell}>
        {loading && progress && (
          <div style={S.progressBox}>
            <div style={S.spinner} />
            <span style={S.progressText}>
              Scanning {progress.count.toLocaleString()} items — {progress.current_path}
            </span>
          </div>
        )}
        {loading && !progress && (
          <div style={S.progressBox}>
            <div style={S.spinner} />
            <span>Starting scan…</span>
          </div>
        )}

        {error && <div style={S.errorBox}>{error}</div>}
        {cancelled && <div style={S.cancelledBox}>Scan cancelled.</div>}

        {result && !loading && selectedPath && view === "tree" && (
          <div style={S.actionBar}>
            <span style={S.actionPath}>{selectedPath}</span>
            <button style={S.actionBtn("#60a5fa")} onClick={handleOpenInExplorer}>
              Show in Finder
            </button>
            {selectedNode?.is_dir && (
              <button style={S.actionBtn("#34d399")} onClick={handleRescan}>
                Rescan
              </button>
            )}
            <button style={S.actionBtn("#f87171")} onClick={handleMoveToTrash}>
              Move to Trash
            </button>
          </div>
        )}

        {result && !loading && view === "tree" && (
          <div style={S.searchRow}>
            <input
              style={S.searchInput}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === "Escape" && setSearchQuery("")}
              onFocus={e => (e.currentTarget.style.borderColor = "#3b82f6")}
              onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)")}
              placeholder="Search by name…"
              spellCheck={false}
            />
            {searchQuery && (
              <button style={S.clearButton} onClick={() => setSearchQuery("")}>×</button>
            )}
            {searchQuery && displayTree && (
              <span style={S.matchCount}>
                {countNodes(displayTree).toLocaleString()} items
              </span>
            )}
          </div>
        )}

        {result ? (
          view === "tree" ? (
            displayTree ? (
              <div style={S.treeWrap}>
                <TreeNode
                  node={displayTree}
                  depth={0}
                  selectedPath={selectedPath}
                  onSelect={setSelectedPath}
                  searchQuery={searchQuery}
                />
              </div>
            ) : (
              <div style={S.noMatches}>No matches for "{searchQuery}"</div>
            )
          ) : (
            <TreemapView
              root={result}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
              searchQuery={treemapSearch}
              drillRequest={drillRequest}
              onDrillRequestHandled={() => setDrillRequest(null)}
              onContextMenu={handleContextMenu}
            />
          )
        ) : (
          !error && !cancelled && !loading && (
            <div style={S.emptyState}>
              <div style={S.emptyIcon}>🗂</div>
              <div style={S.emptyTitle}>No directory scanned yet</div>
              <div style={S.emptyHint}>Enter a path above and press Scan or ↵</div>
            </div>
          )
        )}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          onOpenInFinder={() => { handleOpenInExplorer(); setContextMenu(null); }}
          onRescan={() => { handleRescan(); setContextMenu(null); }}
          onIgnore={() => {
            if (result) setResult(removeAndRecalc(result, contextMenu.node.path));
            setSelectedPath(null);
            setContextMenu(null);
          }}
          onMoveToTrash={() => { handleMoveToTrash(); setContextMenu(null); }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
