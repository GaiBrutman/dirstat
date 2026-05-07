// src/StatusBar.tsx
import React from "react";
import { FileNode, ScanStats } from "./types";
import { formatSize } from "./utils";

interface StatusBarProps {
  loading: boolean;
  scanStats: ScanStats | null;
  scanResult: FileNode | null;
  progress: { count: number; current_path: string } | null;
}

export function StatusBar({ loading, scanStats, scanResult, progress }: StatusBarProps) {
  let content: React.ReactNode;

  if (loading && progress) {
    content = (
      <>
        <span style={{ width: 8, height: 8, borderRadius: "50%", border: "2px solid var(--accent)", borderTopColor: "transparent", animation: "spin 0.7s linear infinite", flexShrink: 0, display: "inline-block" }} />
        <span>Scanning… {progress.count.toLocaleString()} items</span>
        <span style={{ color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {progress.current_path}
        </span>
      </>
    );
  } else if (loading) {
    content = <span style={{ color: "var(--text3)" }}>Starting scan…</span>;
  } else if (scanStats && scanResult) {
    content = (
      <>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--success)", flexShrink: 0, display: "inline-block" }} />
        <span>Scan complete</span>
        <span style={{ color: "var(--text3)" }}>·</span>
        <span>{formatSize(scanStats.totalSize)}</span>
        <span style={{ color: "var(--text3)" }}>·</span>
        <span>{scanStats.fileCount.toLocaleString()} files</span>
        <span style={{ color: "var(--text3)" }}>·</span>
        <span>{scanStats.folderCount.toLocaleString()} folders</span>
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--text3)" }}>
          Scanned in {(scanStats.durationMs / 1000).toFixed(1)}s
        </span>
      </>
    );
  } else {
    content = <span style={{ color: "var(--text3)" }}>Enter a path above and press Scan</span>;
  }

  return (
    <div style={{
      height: 26, background: "var(--surface)", borderTop: "1px solid var(--border)",
      display: "flex", alignItems: "center", padding: "0 16px", gap: 10,
      flexShrink: 0, fontSize: 11, color: "var(--text2)",
      overflow: "hidden",
    }}>
      {content}
    </div>
  );
}
