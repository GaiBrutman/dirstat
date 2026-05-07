// src/Layout.tsx
import React from "react";
import { Theme } from "./theme";

interface LayoutProps {
  theme: Theme;
  onThemeToggle: () => void;
  toolbar: React.ReactNode;
  tabs: React.ReactNode;
  insightStrip: React.ReactNode | null;
  leftPanel: React.ReactNode;
  inspector: React.ReactNode;
  statusBar: React.ReactNode;
}

export function Layout({ theme, onThemeToggle, toolbar, tabs, insightStrip, leftPanel, inspector, statusBar }: LayoutProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden",
      background: "var(--bg)", color: "var(--text)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: "13px",
    }}>
      {/* Titlebar */}
      <div style={{
        height: 38, background: "var(--surface)", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", padding: "0 16px", gap: 12, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 20, height: 20, borderRadius: 5,
            background: "linear-gradient(135deg, #6366f1, #a78bfa)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
          }}>◈</div>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)" }}>
            DirStat
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={onThemeToggle}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          style={{
            background: "none", border: "1px solid var(--border2)", borderRadius: 6,
            padding: "3px 8px", cursor: "pointer", color: "var(--text2)", fontSize: 13,
          }}
        >
          {theme === "dark" ? "☀" : "☽"}
        </button>
      </div>

      {/* Toolbar */}
      {toolbar}

      {/* Nav tabs */}
      {tabs}

      {/* Insight strip */}
      {insightStrip}

      {/* Main split */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          {leftPanel}
        </div>
        <div style={{
          width: 280, flexShrink: 0,
          borderLeft: "1px solid var(--border)",
          background: "var(--surface)",
          overflow: "hidden", display: "flex", flexDirection: "column",
        }}>
          {inspector}
        </div>
      </div>

      {/* Status bar */}
      {statusBar}
    </div>
  );
}
