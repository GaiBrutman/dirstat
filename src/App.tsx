// src/App.tsx
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { FileNode, ScanStats, AppTab, OverviewSubView, DuplicateGroup } from "./types";
import type { FileTypeStats } from "./utils";
import { filterTree, countNodes, removeAndRecalc, replaceNode } from "./utils";
import { detectInsights } from "./insights";
import { getInitialTheme, applyTheme, storeTheme, toggleTheme, Theme } from "./theme";

import { Layout } from "./Layout";
import { StatusBar } from "./StatusBar";
import { Inspector, InspectorTarget } from "./Inspector";
import { InsightStrip } from "./InsightStrip";
import { TreemapView } from "./Treemap";
import { TreeNode } from "./TreeNode";
import { ContextMenu } from "./ContextMenu";
import { LargeFilesView } from "./LargeFilesView";
import { DuplicatesView } from "./DuplicatesView";
import { FileTypesView } from "./FileTypesView";

interface ScanProgress {
  count: number;
  current_path: string;
}

// ── Toolbar ──────────────────────────────────────────────────────────────────

function Toolbar({
  path, onPathChange, onScan, onCancel, loading, activeTab, overviewFilter,
  onOverviewFilterChange,
}: {
  path: string; onPathChange: (p: string) => void; onScan: () => void;
  onCancel: () => void; loading: boolean; activeTab: AppTab;
  overviewFilter: string; onOverviewFilterChange: (v: string) => void;
}) {
  return (
    <div style={{
      height: 50, background: "var(--surface)", borderBottom: "1px solid var(--border)",
      display: "flex", alignItems: "center", padding: "0 16px", gap: 10, flexShrink: 0,
    }}>
      <input
        type="text"
        value={path}
        onChange={(e) => onPathChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !loading && onScan()}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border2)")}
        placeholder="Directory path…"
        disabled={loading}
        spellCheck={false}
        style={{
          flex: 1, background: "var(--surface2)", border: "1px solid var(--border2)",
          borderRadius: 8, padding: "7px 12px", fontSize: 13, color: "var(--text)",
          outline: "none", fontFamily: "inherit",
        }}
      />
      {activeTab === "overview" && (
        <div style={{ position: "relative", display: "flex", alignItems: "center", flexShrink: 0 }}>
          <input
            type="text"
            value={overviewFilter}
            onChange={(e) => onOverviewFilterChange(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onOverviewFilterChange("")}
            placeholder="Filter…"
            spellCheck={false}
            style={{
              width: 150, background: "var(--surface2)", border: "1px solid var(--border2)",
              borderRadius: 8, padding: "7px 30px 7px 12px", fontSize: 13,
              color: "var(--text)", outline: "none", fontFamily: "inherit",
            }}
          />
          {overviewFilter && (
            <button
              onClick={() => onOverviewFilterChange("")}
              style={{
                position: "absolute", right: 8, background: "none", border: "none",
                color: "var(--text3)", cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1,
              }}
            >×</button>
          )}
        </div>
      )}
      <button
        onClick={onScan}
        disabled={loading}
        style={{
          padding: "7px 20px", borderRadius: 8, border: "none",
          background: loading ? "rgba(99,102,241,0.45)" : "var(--accent)",
          color: "#fff", fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
          fontFamily: "inherit", flexShrink: 0,
        }}
      >Scan</button>
      {loading && (
        <button
          onClick={onCancel}
          style={{
            padding: "7px 14px", borderRadius: 8,
            border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.12)",
            color: "var(--danger)", fontSize: 13, fontWeight: 600, cursor: "pointer",
            fontFamily: "inherit", flexShrink: 0,
          }}
        >Cancel</button>
      )}
    </div>
  );
}

// ── Nav Tabs ─────────────────────────────────────────────────────────────────

function NavTabs({
  activeTab, onTabChange, scanResult, overviewSubView, onOverviewSubViewChange,
}: {
  activeTab: AppTab; onTabChange: (t: AppTab) => void; scanResult: FileNode | null;
  overviewSubView: OverviewSubView; onOverviewSubViewChange: (v: OverviewSubView) => void;
}) {
  const tabs: { id: AppTab; label: string }[] = [
    { id: "overview",    label: "Overview" },
    { id: "large-files", label: "Large Files" },
    { id: "duplicates",  label: "Duplicates" },
    { id: "file-types",  label: "File Types" },
  ];

  return (
    <div style={{
      height: 40, background: "var(--surface)", borderBottom: "1px solid var(--border)",
      display: "flex", alignItems: "stretch", padding: "0 16px", gap: 2, flexShrink: 0,
    }}>
      {tabs.map(({ id, label }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            disabled={!scanResult && id !== "overview"}
            style={{
              padding: "0 14px", border: "none", background: "none",
              borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
              color: isActive ? "var(--accent2)" : "var(--text3)",
              fontSize: 12, fontWeight: 500, cursor: scanResult || id === "overview" ? "pointer" : "not-allowed",
              fontFamily: "inherit", position: "relative", top: 1,
              transition: "color 120ms",
            }}
          >{label}</button>
        );
      })}
      {activeTab === "overview" && scanResult && (
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 2 }}>
          {(["treemap", "tree"] as OverviewSubView[]).map((v) => (
            <button
              key={v}
              onClick={() => onOverviewSubViewChange(v)}
              style={{
                padding: "3px 12px", borderRadius: 6, border: "none",
                background: overviewSubView === v ? "rgba(255,255,255,0.10)" : "transparent",
                color: overviewSubView === v ? "var(--text)" : "var(--text3)",
                fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                textTransform: "capitalize",
              }}
            >{v}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Overview Panel ────────────────────────────────────────────────────────────

function OverviewPanel({
  result, overviewSubView, selectedPath, onSelect, overviewFilter, searchQuery,
  onSearchQueryChange, drillRequest, onDrillRequestHandled, onContextMenu, backRequest,
}: {
  result: FileNode; overviewSubView: OverviewSubView;
  selectedPath: string | null; onSelect: (p: string | null) => void;
  overviewFilter: string; searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  drillRequest: string | null; onDrillRequestHandled: () => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  backRequest: number;
}) {
  if (overviewSubView === "treemap") {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, padding: 12 }}>
        <TreemapView
          root={result}
          selectedPath={selectedPath}
          onSelect={onSelect}
          searchQuery={overviewFilter}
          drillRequest={drillRequest}
          onDrillRequestHandled={onDrillRequestHandled}
          onContextMenu={onContextMenu}
          backRequest={backRequest}
        />
      </div>
    );
  }

  const displayTree = searchQuery ? filterTree(result, searchQuery) : result;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, padding: "8px 12px", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onSearchQueryChange("")}
          placeholder="Search by name…"
          spellCheck={false}
          style={{
            flex: 1, background: "var(--surface2)", border: "1px solid var(--border2)",
            borderRadius: 8, padding: "6px 12px", fontSize: 13, color: "var(--text)",
            outline: "none", fontFamily: "inherit",
          }}
        />
        {searchQuery && (
          <button onClick={() => onSearchQueryChange("")}
            style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 14 }}>
            ×
          </button>
        )}
        {searchQuery && displayTree && (
          <span style={{ fontSize: 12, color: "var(--text3)", flexShrink: 0 }}>
            {countNodes(displayTree).toLocaleString()} items
          </span>
        )}
      </div>
      {displayTree ? (
        <div style={{
          flex: 1, minHeight: 0, overflow: "auto",
          background: "var(--surface2)", borderRadius: 8,
          border: "1px solid var(--border)", padding: 8,
        }}>
          <TreeNode
            node={displayTree}
            depth={0}
            selectedPath={selectedPath}
            onSelect={onSelect}
            searchQuery={searchQuery}
          />
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text3)", fontSize: 13 }}>
          No matches for "{searchQuery}"
        </div>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const [path, setPath] = useState("/");
  const [result, setResult] = useState<FileNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [scanStats, setScanStats] = useState<ScanStats | null>(null);
  const [scanStart, setScanStart] = useState<number | null>(null);

  const [activeTab, setActiveTab] = useState<AppTab>("overview");
  const [overviewSubView, setOverviewSubView] = useState<OverviewSubView>("treemap");
  const [overviewFilter, setOverviewFilter] = useState("");
  const [treeSearch, setTreeSearch] = useState("");
  const [drillRequest, setDrillRequest] = useState<string | null>(null);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [inspectorTarget, setInspectorTarget] = useState<InspectorTarget>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null);
  const [treemapBackRequest, setTreemapBackRequest] = useState(0);

  useEffect(() => {
    applyTheme(theme);
    storeTheme(theme);
  }, [theme]);

  // Sync selectedPath → inspectorTarget (file/dir mode)
  const selectedNode = useCallback((): FileNode | null => {
    if (!result || !selectedPath) return null;
    function find(node: FileNode): FileNode | null {
      if (node.path === selectedPath) return node;
      for (const child of node.children) { const f = find(child); if (f) return f; }
      return null;
    }
    return find(result);
  }, [result, selectedPath])();

  useEffect(() => {
    if (selectedNode && result) {
      setInspectorTarget({ kind: "file", node: selectedNode, root: result });
    } else if (!selectedPath) {
      setInspectorTarget(null);
    }
  }, [selectedNode, selectedPath, result]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && loading) { invoke("cancel_scan"); return; }
      if (e.key === "Escape") { setTreeSearch(""); setOverviewFilter(""); return; }
      if (e.key === "Backspace" && activeTab === "overview" && overviewSubView === "treemap") {
        const target = document.activeElement?.tagName;
        if (target !== "INPUT" && target !== "TEXTAREA") {
          e.preventDefault();
          setTreemapBackRequest(n => n + 1);
          return;
        }
      }
      if ((e.key === "Delete" || (e.metaKey && e.key === "Backspace")) && selectedPath) {
        handleMoveToTrash(); return;
      }
      if (e.key === " " && selectedPath) { handleOpenInExplorer(); return; }
      if (e.metaKey && e.key === "f") {
        e.preventDefault();
        if (activeTab === "overview" && overviewSubView === "treemap") {
          (document.querySelector('input[placeholder="Filter…"]') as HTMLInputElement)?.focus();
        } else if (activeTab === "overview") {
          (document.querySelector('input[placeholder="Search by name…"]') as HTMLInputElement)?.focus();
        }
        return;
      }
      const tabKeys: Record<string, AppTab> = { "1": "overview", "2": "large-files", "3": "duplicates", "4": "file-types" };
      if (tabKeys[e.key] && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = document.activeElement?.tagName;
        if (target !== "INPUT" && target !== "TEXTAREA") setActiveTab(tabKeys[e.key]);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, selectedPath, activeTab, overviewSubView]);

  async function handleScan(scanPath?: string) {
    const target = scanPath ?? path;
    if (loading) return;
    setLoading(true);
    setError(null);
    setCancelled(false);
    setProgress(null);
    setScanStats(null);
    const started = Date.now();
    setScanStart(started);
    if (!scanPath) {
      setResult(null);
      setSelectedPath(null);
      setInspectorTarget(null);
      setOverviewFilter("");
      setTreeSearch("");
    }

    const unlisten = await listen<ScanProgress>("scan_progress", (ev) => setProgress(ev.payload));
    try {
      const data = await invoke<FileNode>("scan", { path: target });
      if (scanPath && result) {
        setResult(replaceNode(result, data));
      } else {
        setResult(data);
        await getCurrentWindow().setTitle(`DirStat — ${target}`);
        setScanStats({
          totalSize: data.size,
          fileCount: data.file_count,
          folderCount: countFolders(data),
          durationMs: Date.now() - started,
        });
      }
    } catch (err) {
      const msg = String(err);
      if (msg === "cancelled") setCancelled(true);
      else setError(msg);
    } finally {
      unlisten();
      setLoading(false);
      setProgress(null);
    }
  }

  function countFolders(node: FileNode): number {
    if (!node.is_dir) return 0;
    return 1 + node.children.reduce((s, c) => s + countFolders(c), 0);
  }

  async function handleOpenInExplorer(p?: string) {
    const target = p ?? selectedPath;
    if (!target) return;
    await invoke("open_in_explorer", { path: target });
  }

  async function handleMoveToTrash(p?: string) {
    const target = p ?? selectedPath;
    if (!target || !result) return;
    try {
      await invoke("move_to_trash", { path: target });
      const newTree = removeAndRecalc(result, target);
      setResult(newTree);
      if (target === selectedPath) { setSelectedPath(null); setInspectorTarget(null); }
    } catch (err) { setError(String(err)); }
  }

  async function handleRescan(p?: string) {
    const target = p ?? selectedPath;
    if (!target) return;
    await handleScan(target);
  }

  function handleContextMenu(e: React.MouseEvent, node: FileNode) {
    e.preventDefault();
    setSelectedPath(node.path);
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }

  function handleInsightNavigate(navTarget: "overview" | "large-files", filter: string) {
    if (navTarget === "overview") {
      setActiveTab("overview");
      if (overviewSubView === "treemap") setOverviewFilter(filter);
      else setTreeSearch(filter);
    } else {
      setActiveTab("large-files");
    }
  }

  const insights = result && !loading ? detectInsights(result) : [];

  // suppress unused variable warning for scanStart
  void scanStart;

  return (
    <>
    <Layout
      theme={theme}
      onThemeToggle={() => setTheme((t) => toggleTheme(t))}
      toolbar={
        <Toolbar
          path={path} onPathChange={setPath}
          onScan={() => handleScan()} onCancel={() => invoke("cancel_scan")}
          loading={loading} activeTab={activeTab}
          overviewFilter={overviewFilter} onOverviewFilterChange={setOverviewFilter}
        />
      }
      tabs={
        <NavTabs
          activeTab={activeTab} onTabChange={setActiveTab}
          scanResult={result}
          overviewSubView={overviewSubView} onOverviewSubViewChange={setOverviewSubView}
        />
      }
      insightStrip={
        insights.length > 0 ? (
          <InsightStrip insights={insights} onNavigate={handleInsightNavigate} />
        ) : null
      }
      leftPanel={
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          {error && (
            <div style={{
              background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.25)",
              borderRadius: 8, padding: "8px 14px", margin: "10px 12px 0",
              fontSize: 13, color: "var(--danger)", flexShrink: 0,
            }}>{error}</div>
          )}
          {cancelled && (
            <div style={{
              background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.25)",
              borderRadius: 8, padding: "8px 14px", margin: "10px 12px 0",
              fontSize: 13, color: "var(--warning)", flexShrink: 0,
            }}>Scan cancelled.</div>
          )}
          {loading && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.20)",
              borderRadius: 8, padding: "8px 14px", margin: "10px 12px 0",
              fontSize: 12, color: "var(--accent2)", flexShrink: 0,
            }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(99,102,241,0.3)", borderTopColor: "var(--accent)", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
              {progress ? `Scanning ${progress.count.toLocaleString()} items — ${progress.current_path}` : "Starting scan…"}
            </div>
          )}

          {!result && !loading && !error && !cancelled && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "var(--text3)" }}>
              <div style={{ fontSize: 48, lineHeight: 1, opacity: 0.4 }}>🗂</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text2)" }}>No directory scanned yet</div>
              <div style={{ fontSize: 12 }}>Enter a path above and press Scan or ↵</div>
            </div>
          )}

          {result && (
            <>
              <div style={{ display: activeTab === "overview" && !loading ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
                <OverviewPanel
                  result={result}
                  overviewSubView={overviewSubView}
                  selectedPath={selectedPath}
                  onSelect={setSelectedPath}
                  overviewFilter={overviewFilter}
                  searchQuery={treeSearch}
                  onSearchQueryChange={setTreeSearch}
                  drillRequest={drillRequest}
                  onDrillRequestHandled={() => setDrillRequest(null)}
                  onContextMenu={handleContextMenu}
                  backRequest={treemapBackRequest}
                />
              </div>
              <div style={{ display: activeTab === "large-files" && !loading ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
                <LargeFilesView
                  root={result}
                  onSelect={(node: FileNode) => setInspectorTarget({ kind: "file", node, root: result })}
                  onOpenInFinder={(p: string) => handleOpenInExplorer(p)}
                  onMoveToTrash={(p: string) => handleMoveToTrash(p)}
                />
              </div>
              <div style={{ display: activeTab === "duplicates" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
                <DuplicatesView
                  scanPath={path}
                  scanResult={result}
                  onSelectGroup={(group: DuplicateGroup) => setInspectorTarget({ kind: "duplicate-group", group })}
                  onMoveToTrash={(p: string) => handleMoveToTrash(p)}
                />
              </div>
              <div style={{ display: activeTab === "file-types" && !loading ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
                <FileTypesView
                  root={result}
                  onSelectExtension={(stats: FileTypeStats, topFiles: FileNode[]) =>
                    setInspectorTarget({ kind: "extension", stats, topFiles })
                  }
                />
              </div>
            </>
          )}
        </div>
      }
      inspector={
        <Inspector
          target={inspectorTarget}
          onOpenInFinder={(p: string) => handleOpenInExplorer(p)}
          onRescan={(p: string) => handleRescan(p)}
          onMoveToTrash={(p: string) => handleMoveToTrash(p)}
        />
      }
      statusBar={
        <StatusBar loading={loading} scanStats={scanStats} scanResult={result} progress={progress} />
      }
    />
    {contextMenu && (
      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        node={contextMenu.node}
        onOpenInFinder={() => { handleOpenInExplorer(contextMenu.node.path); setContextMenu(null); }}
        onRescan={() => { handleRescan(contextMenu.node.path); setContextMenu(null); }}
        onIgnore={() => {
          if (result) setResult(removeAndRecalc(result, contextMenu.node.path));
          setSelectedPath(null);
          setContextMenu(null);
        }}
        onMoveToTrash={() => { handleMoveToTrash(contextMenu.node.path); setContextMenu(null); }}
        onClose={() => setContextMenu(null)}
      />
    )}
    </>
  );
}
