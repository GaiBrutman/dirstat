# DirStat Professional UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform DirStat into a professional two-panel disk analyzer with tabbed navigation (Overview, Large Files, Duplicates, File Types), a contextual inspector panel, smart insight detection, adaptive dark/light theme, and a new Rust duplicate-finding command.

**Architecture:** App.tsx owns all state and orchestration; Layout.tsx provides the CSS grid shell (titlebar → toolbar → tabs → insight strip → main split → status bar); each tab renders its own view component into the left panel; Inspector.tsx renders the right panel based on whatever is selected. Pure utility functions in utils.ts and insights.ts are tested in isolation.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri v2, Rust, sha2 crate (file hashing)

---

## File Map

**Create:**
- `src/theme.ts` — theme utilities (get, apply, store, toggle)
- `src/insights.ts` — pure pattern-detection functions (testable)
- `src/insights.test.ts` — Vitest tests for insights.ts
- `src/Layout.tsx` — CSS grid shell component
- `src/StatusBar.tsx` — bottom status bar component
- `src/Inspector.tsx` — right inspector panel (file / duplicate-group / extension modes)
- `src/InsightStrip.tsx` — insight pill strip rendered between tabs and main content
- `src/LargeFilesView.tsx` — flat sortable large-files list
- `src/FileTypesView.tsx` — category bars + extension table
- `src/DuplicatesView.tsx` — duplicate groups UI, triggers find_duplicates
- `src-tauri/src/duplicates.rs` — Rust duplicate-finding logic

**Modify:**
- `src/App.css` — add CSS custom property tokens for dark + light themes
- `src/theme.ts` *(created above)*
- `src/utils.ts` — add `getFileCategory`, `CATEGORY_COLORS`, `CATEGORY_LABELS`, `collectLargeFiles`, `FileTypeStats`, `computeFileTypes`, `computeCategoryBreakdown`
- `src/utils.test.ts` — add tests for new utils
- `src/types.ts` — add `DuplicateFile`, `DuplicateGroup`
- `src/App.tsx` — full refactor: add theme/tab state, use Layout, wire all sub-components
- `src/Treemap.tsx` — import category constants from utils.ts, use CSS vars for non-tile colors
- `src/TreeNode.tsx` — use CSS vars instead of hardcoded Tailwind classes
- `src-tauri/Cargo.toml` — add `sha2` dependency
- `src-tauri/src/commands.rs` — add `find_duplicates` command
- `src-tauri/src/lib.rs` — register `find_duplicates`

---

## Task 1: CSS Theme Tokens

**Files:**
- Modify: `src/App.css`
- Create: `src/theme.ts`

- [ ] **Step 1: Replace App.css with themed CSS variables**

```css
/* src/App.css */
@import "tailwindcss";

html, body, #root {
  height: 100%;
  overflow: hidden;
}

:root[data-theme="dark"] {
  --bg:       #0f0f11;
  --surface:  #18181b;
  --surface2: #222226;
  --border:   rgba(255,255,255,0.07);
  --border2:  rgba(255,255,255,0.12);
  --text:     #e4e4e7;
  --text2:    #a1a1aa;
  --text3:    #52525b;
  --accent:   #6366f1;
  --accent2:  #818cf8;
  --danger:   #f87171;
  --warning:  #fbbf24;
  --success:  #34d399;
}

:root[data-theme="light"] {
  --bg:       #f5f5f7;
  --surface:  #ffffff;
  --surface2: #f0f0f2;
  --border:   rgba(0,0,0,0.08);
  --border2:  rgba(0,0,0,0.14);
  --text:     #111113;
  --text2:    #52525b;
  --text3:    #a1a1aa;
  --accent:   #4f46e5;
  --accent2:  #6366f1;
  --danger:   #dc2626;
  --warning:  #d97706;
  --success:  #16a34a;
}

@keyframes spin { to { transform: rotate(360deg); } }
```

- [ ] **Step 2: Create src/theme.ts**

```typescript
// src/theme.ts
export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'dirstat-theme';

export function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

export function storeTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
}

export function toggleTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark';
}
```

- [ ] **Step 3: Commit**

```bash
git add src/App.css src/theme.ts
git commit -m "feat: add CSS theme tokens and theme utilities"
```

---

## Task 2: Shared Category Constants + New Utility Functions

**Files:**
- Modify: `src/utils.ts`
- Modify: `src/utils.test.ts`
- Modify: `src/Treemap.tsx` (import from utils)

- [ ] **Step 1: Write the failing tests first**

Append to `src/utils.test.ts`:

```typescript
import { collectLargeFiles, computeFileTypes, getFileCategory, computeCategoryBreakdown } from "./utils";

describe("getFileCategory", () => {
  it("returns 'image' for jpg", () => {
    expect(getFileCategory(makeFile("photo.jpg"))).toBe("image");
  });
  it("returns 'code' for ts", () => {
    expect(getFileCategory(makeFile("index.ts"))).toBe("code");
  });
  it("returns 'other' for unknown extension", () => {
    expect(getFileCategory(makeFile("mystery.xyzabc"))).toBe("other");
  });
  it("returns 'directory' for a dir", () => {
    expect(getFileCategory(makeDir("src", []))).toBe("directory");
  });
});

describe("collectLargeFiles", () => {
  it("returns files above the threshold sorted by size descending", () => {
    const root = makeDir("root", [
      makeFile("big.dmg", 500_000_000),
      makeFile("tiny.txt", 1000),
      makeFile("medium.zip", 200_000_000),
    ], 701_001_000);
    const result = collectLargeFiles(root, 100_000_000);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("big.dmg");
    expect(result[1].name).toBe("medium.zip");
  });

  it("does not include directories", () => {
    const sub = makeDir("node_modules", [makeFile("pkg.js", 100)], 8_000_000_000);
    const root = makeDir("root", [sub], 8_000_000_000);
    const result = collectLargeFiles(root, 1_000_000);
    expect(result.every(n => !n.is_dir)).toBe(true);
  });

  it("returns empty array when nothing meets threshold", () => {
    const root = makeDir("root", [makeFile("a.txt", 100)], 100);
    expect(collectLargeFiles(root, 1_000_000)).toHaveLength(0);
  });
});

describe("computeFileTypes", () => {
  it("groups files by extension and sums sizes", () => {
    const root = makeDir("root", [
      makeFile("a.ts", 1000),
      makeFile("b.ts", 2000),
      makeFile("c.jpg", 5000),
    ], 8000);
    const stats = computeFileTypes(root);
    const tsEntry = stats.find(s => s.extension === "ts");
    expect(tsEntry).toBeDefined();
    expect(tsEntry!.totalSize).toBe(3000);
    expect(tsEntry!.count).toBe(2);
  });

  it("sorts by totalSize descending", () => {
    const root = makeDir("root", [
      makeFile("a.ts", 100),
      makeFile("big.dmg", 99999),
    ], 100099);
    const stats = computeFileTypes(root);
    expect(stats[0].extension).toBe("dmg");
  });
});

describe("computeCategoryBreakdown", () => {
  it("returns one entry per category that has files", () => {
    const root = makeDir("root", [
      makeFile("a.ts", 1000),
      makeFile("b.jpg", 2000),
    ], 3000);
    const breakdown = computeCategoryBreakdown(root);
    const cats = breakdown.map(b => b.category);
    expect(cats).toContain("code");
    expect(cats).toContain("image");
    expect(breakdown.every(b => b.size > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/user/Projects/Apps/dirstat && npm test
```

Expected: FAIL — `collectLargeFiles` not exported from `./utils`

- [ ] **Step 3: Add constants and new functions to utils.ts**

Append to `src/utils.ts` (after existing exports):

```typescript
// ── Category helpers (shared with Treemap, Inspector, FileTypesView) ──

const EXT_IMAGE = new Set(["jpg","jpeg","png","gif","svg","webp","ico","bmp","avif","heic","tiff"]);
const EXT_VIDEO = new Set(["mp4","mov","avi","mkv","wmv","flv","webm","m4v","mpg"]);
const EXT_AUDIO = new Set(["mp3","wav","flac","aac","ogg","m4a","opus","wma"]);
const EXT_CODE  = new Set(["ts","tsx","js","jsx","py","rs","go","java","cpp","c","h","cs","rb","php","swift","kt","html","css","scss","json","yaml","yml","toml","xml","sh","bash"]);
const EXT_DOC   = new Set(["pdf","doc","docx","txt","md","rtf","xls","xlsx","ppt","pptx","csv","epub"]);
const EXT_ARC   = new Set(["zip","tar","gz","rar","7z","bz2","xz","dmg","iso","pkg","deb","rpm"]);

export function getFileCategory(node: FileNode): string {
  if (node.is_dir) return "directory";
  const ext = node.name.split(".").pop()?.toLowerCase() ?? "";
  if (EXT_IMAGE.has(ext)) return "image";
  if (EXT_VIDEO.has(ext)) return "video";
  if (EXT_AUDIO.has(ext)) return "audio";
  if (EXT_CODE.has(ext))  return "code";
  if (EXT_DOC.has(ext))   return "document";
  if (EXT_ARC.has(ext))   return "archive";
  return "other";
}

export const CATEGORY_COLORS: Record<string, string> = {
  directory: "#2563eb", image: "#d97706", video: "#dc2626", audio: "#ea580c",
  code: "#7c3aed", document: "#16a34a", archive: "#0d9488", other: "#475569",
};

export const CATEGORY_LABELS: Record<string, string> = {
  directory: "Folders", image: "Images", video: "Video", audio: "Audio",
  code: "Code", document: "Documents", archive: "Archives", other: "Other",
};

// ── Large Files ──

export function collectLargeFiles(root: FileNode, minBytes: number): FileNode[] {
  const result: FileNode[] = [];
  function walk(node: FileNode) {
    if (!node.is_dir) {
      if (node.size >= minBytes) result.push(node);
    } else {
      for (const child of node.children) walk(child);
    }
  }
  walk(root);
  result.sort((a, b) => b.size - a.size);
  return result;
}

// ── File Type Analytics ──

export interface FileTypeStats {
  extension: string;
  category: string;
  count: number;
  totalSize: number;
}

export function computeFileTypes(root: FileNode): FileTypeStats[] {
  const map = new Map<string, { category: string; count: number; totalSize: number }>();
  function walk(node: FileNode) {
    if (!node.is_dir) {
      const ext = node.name.includes(".") ? node.name.split(".").pop()!.toLowerCase() : "(none)";
      const category = getFileCategory(node);
      const entry = map.get(ext) ?? { category, count: 0, totalSize: 0 };
      map.set(ext, { ...entry, count: entry.count + 1, totalSize: entry.totalSize + node.size });
    } else {
      for (const child of node.children) walk(child);
    }
  }
  walk(root);
  return Array.from(map.entries())
    .map(([extension, d]) => ({ extension, ...d }))
    .sort((a, b) => b.totalSize - a.totalSize);
}

export interface CategoryBreakdown {
  category: string;
  label: string;
  color: string;
  size: number;
  count: number;
}

export function computeCategoryBreakdown(root: FileNode): CategoryBreakdown[] {
  const map = new Map<string, { size: number; count: number }>();
  function walk(node: FileNode) {
    if (!node.is_dir) {
      const cat = getFileCategory(node);
      const entry = map.get(cat) ?? { size: 0, count: 0 };
      map.set(cat, { size: entry.size + node.size, count: entry.count + 1 });
    } else {
      for (const child of node.children) walk(child);
    }
  }
  walk(root);
  return Array.from(map.entries())
    .map(([category, d]) => ({
      category,
      label: CATEGORY_LABELS[category] ?? category,
      color: CATEGORY_COLORS[category] ?? "#475569",
      ...d,
    }))
    .sort((a, b) => b.size - a.size);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/user/Projects/Apps/dirstat && npm test
```

Expected: All tests PASS.

- [ ] **Step 5: Update Treemap.tsx to import from utils instead of defining inline**

In `src/Treemap.tsx`, remove the blocks that define `EXT_IMAGE`, `EXT_VIDEO`, `EXT_AUDIO`, `EXT_CODE`, `EXT_DOC`, `EXT_ARC`, `getCategory`, `CATEGORY_COLORS`, and `CATEGORY_LABELS`. Replace them with:

```typescript
import { getFileCategory, CATEGORY_COLORS, CATEGORY_LABELS } from "./utils";
```

Then replace every call to `getCategory(...)` with `getFileCategory(...)` throughout `Treemap.tsx`.

- [ ] **Step 6: Type-check**

```bash
cd /Users/user/Projects/Apps/dirstat && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/utils.ts src/utils.test.ts src/Treemap.tsx
git commit -m "feat: extract category constants to utils, add collectLargeFiles/computeFileTypes"
```

---

## Task 3: Insight Detection Engine

**Files:**
- Create: `src/insights.ts`
- Create: `src/insights.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/insights.test.ts
import { describe, it, expect } from "vitest";
import { detectInsights } from "./insights";
import { FileNode } from "./types";

function makeFile(name: string, size = 100, path = `/root/${name}`): FileNode {
  return { name, path, size, is_dir: false, children: [], file_count: 0 };
}
function makeDir(name: string, children: FileNode[], path = `/root/${name}`): FileNode {
  const size = children.reduce((s, c) => s + c.size, 0);
  return { name, path, size, is_dir: true, children, file_count: children.length };
}

describe("detectInsights", () => {
  it("detects node_modules directories", () => {
    const nm = makeDir("node_modules", [makeFile("index.js", 5_000_000)]);
    const root = makeDir("root", [nm], "/root");
    const insights = detectInsights(root);
    const hit = insights.find(i => i.id === "node_modules");
    expect(hit).toBeDefined();
    expect(hit!.count).toBe(1);
    expect(hit!.totalSize).toBe(5_000_000);
    expect(hit!.navTarget).toBe("overview");
  });

  it("aggregates multiple node_modules", () => {
    const nm1 = makeDir("node_modules", [makeFile("a.js", 1_000_000)], "/p1/node_modules");
    const nm2 = makeDir("node_modules", [makeFile("b.js", 2_000_000)], "/p2/node_modules");
    const root = makeDir("root", [nm1, nm2], "/root");
    const insights = detectInsights(root);
    const hit = insights.find(i => i.id === "node_modules");
    expect(hit!.count).toBe(2);
    expect(hit!.totalSize).toBe(3_000_000);
  });

  it("detects .dmg files with navTarget large-files", () => {
    const dmg = makeFile("Installer.dmg", 2_000_000_000);
    const root = makeDir("root", [dmg], "/root");
    const insights = detectInsights(root);
    const hit = insights.find(i => i.id === "dmg");
    expect(hit).toBeDefined();
    expect(hit!.navTarget).toBe("large-files");
  });

  it("returns empty array when no patterns found", () => {
    const root = makeDir("root", [makeFile("readme.md", 100)], "/root");
    const insights = detectInsights(root);
    expect(insights).toHaveLength(0);
  });

  it("only returns patterns with count > 0", () => {
    const root = makeDir("root", [makeFile("a.ts", 100)], "/root");
    const insights = detectInsights(root);
    expect(insights.every(i => i.count > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/user/Projects/Apps/dirstat && npm test
```

Expected: FAIL — `detectInsights` not found.

- [ ] **Step 3: Create src/insights.ts**

```typescript
// src/insights.ts
import { FileNode } from "./types";

export interface InsightResult {
  id: string;
  icon: string;
  label: string;
  count: number;
  totalSize: number;
  navTarget: "overview" | "large-files";
  filter: string;
}

interface Pattern {
  id: string;
  icon: string;
  label: string;
  navTarget: "overview" | "large-files";
  filter: string;
  matches: (node: FileNode) => boolean;
}

const PATTERNS: Pattern[] = [
  {
    id: "node_modules",
    icon: "⚡",
    label: "node_modules",
    navTarget: "overview",
    filter: "node_modules",
    matches: (n) => n.is_dir && n.name === "node_modules",
  },
  {
    id: "derived_data",
    icon: "🔨",
    label: "Xcode DerivedData",
    navTarget: "overview",
    filter: "DerivedData",
    matches: (n) => n.is_dir && n.name === "DerivedData",
  },
  {
    id: "pycache",
    icon: "🐍",
    label: "__pycache__",
    navTarget: "overview",
    filter: "__pycache__",
    matches: (n) => n.is_dir && n.name === "__pycache__",
  },
  {
    id: "gradle_cache",
    icon: "☕",
    label: "Gradle caches",
    navTarget: "overview",
    filter: "caches",
    matches: (n) => n.is_dir && n.path.includes(".gradle/caches"),
  },
  {
    id: "dmg",
    icon: "📦",
    label: ".dmg installers",
    navTarget: "large-files",
    filter: ".dmg",
    matches: (n) => !n.is_dir && n.name.toLowerCase().endsWith(".dmg"),
  },
  {
    id: "pkg",
    icon: "📦",
    label: ".pkg installers",
    navTarget: "large-files",
    filter: ".pkg",
    matches: (n) => !n.is_dir && n.name.toLowerCase().endsWith(".pkg"),
  },
];

export function detectInsights(root: FileNode): InsightResult[] {
  const accumulators = new Map<string, InsightResult>(
    PATTERNS.map((p) => [
      p.id,
      { id: p.id, icon: p.icon, label: p.label, count: 0, totalSize: 0, navTarget: p.navTarget, filter: p.filter },
    ])
  );

  function walk(node: FileNode) {
    for (const pattern of PATTERNS) {
      if (pattern.matches(node)) {
        const acc = accumulators.get(pattern.id)!;
        acc.count++;
        acc.totalSize += node.size;
      }
    }
    for (const child of node.children) walk(child);
  }
  walk(root);

  return Array.from(accumulators.values()).filter((r) => r.count > 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/user/Projects/Apps/dirstat && npm test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/insights.ts src/insights.test.ts
git commit -m "feat: add insight pattern detection engine with tests"
```

---

## Task 4: Layout Shell + App.tsx Refactor

**Files:**
- Create: `src/Layout.tsx`
- Create: `src/StatusBar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/types.ts`

- [ ] **Step 1: Add new types to types.ts**

Append to `src/types.ts`:

```typescript
export interface DuplicateFile {
  path: string;
  modified: number; // Unix timestamp seconds
}

export interface DuplicateGroup {
  hash: string;
  size: number;
  total_wasted: number;
  files: DuplicateFile[];
}

export interface ScanStats {
  totalSize: number;
  fileCount: number;
  folderCount: number;
  durationMs: number;
}

export type AppTab = "overview" | "large-files" | "duplicates" | "file-types";
export type OverviewSubView = "treemap" | "tree";
```

- [ ] **Step 2: Create src/Layout.tsx**

```tsx
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
```

- [ ] **Step 3: Create src/StatusBar.tsx**

```tsx
// src/StatusBar.tsx
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
```

- [ ] **Step 4: Refactor App.tsx**

Replace the entire contents of `src/App.tsx`:

```tsx
// src/App.tsx
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { FileNode, ScanStats, AppTab, OverviewSubView } from "./types";
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
  onSearchQueryChange, drillRequest, onDrillRequestHandled, onContextMenu,
}: {
  result: FileNode; overviewSubView: OverviewSubView;
  selectedPath: string | null; onSelect: (p: string | null) => void;
  overviewFilter: string; searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  drillRequest: string | null; onDrillRequestHandled: () => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
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

  return (
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

          {result && !loading && activeTab === "overview" && (
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
            />
          )}
          {result && !loading && activeTab === "large-files" && (
            <LargeFilesView
              root={result}
              onSelect={(node) => setInspectorTarget({ kind: "file", node, root: result })}
              onOpenInFinder={(p) => handleOpenInExplorer(p)}
              onMoveToTrash={(p) => handleMoveToTrash(p)}
            />
          )}
          {activeTab === "duplicates" && (
            <DuplicatesView
              scanPath={path}
              scanResult={result}
              onSelectGroup={(group) => setInspectorTarget({ kind: "duplicate-group", group })}
              onMoveToTrash={(p) => handleMoveToTrash(p)}
            />
          )}
          {result && !loading && activeTab === "file-types" && (
            <FileTypesView
              root={result}
              onSelectExtension={(stats, topFiles) =>
                setInspectorTarget({ kind: "extension", stats, topFiles })
              }
            />
          )}
        </div>
      }
      inspector={
        <Inspector
          target={inspectorTarget}
          onOpenInFinder={(p) => handleOpenInExplorer(p)}
          onRescan={(p) => handleRescan(p)}
          onMoveToTrash={(p) => handleMoveToTrash(p)}
        />
      }
      statusBar={
        <StatusBar loading={loading} scanStats={scanStats} scanResult={result} progress={progress} />
      }
    />
  );
}
```

- [ ] **Step 5: Update TreeNode.tsx to use CSS variables**

In `src/TreeNode.tsx`, replace the `className` on the row div with an inline style, and remove Tailwind-specific classes. The row element becomes:

```tsx
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
```

Replace the expand/collapse indicator:
```tsx
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
```

Replace the name span and size span:
```tsx
{renderName(node.name)}  {/* renderName returns the span as before */}
<span style={{ fontSize: 11, color: "var(--text2)", flexShrink: 0 }}>
  {formatSize(node.size)}
  {node.is_dir && node.file_count > 0 && (
    <span style={{ marginLeft: 8 }}>{node.file_count.toLocaleString()} files</span>
  )}
</span>
```

In `renderName`, update the mark style to use CSS vars:
```tsx
<mark style={{ background: "rgba(251,191,36,0.25)", color: "var(--warning)", borderRadius: 2, padding: "0 1px" }}>
```

Remove the `<style>` import from `"./App.css"` in `TreeNode.tsx` if present (it's imported in main.tsx).

- [ ] **Step 6: Type-check — expect errors for missing component files**

```bash
cd /Users/user/Projects/Apps/dirstat && npx tsc --noEmit 2>&1 | head -40
```

Expected: errors about `Inspector`, `InsightStrip`, `LargeFilesView`, `DuplicatesView`, `FileTypesView` not found — these are created in Tasks 5–10. `Layout` and `StatusBar` should resolve cleanly.

- [ ] **Step 7: Commit (with type errors — stubs come next)**

```bash
git add src/types.ts src/Layout.tsx src/StatusBar.tsx src/App.tsx src/TreeNode.tsx
git commit -m "feat: layout shell, status bar, App refactor with tab/theme state"
```

---

## Task 5: Inspector Panel

**Files:**
- Create: `src/Inspector.tsx`

- [ ] **Step 1: Create src/Inspector.tsx**

```tsx
// src/Inspector.tsx
import { useState, useEffect } from "react";
import { FileNode, DuplicateGroup } from "./types";
import { FileTypeStats, formatSize, getFileCategory, CATEGORY_COLORS } from "./utils";

export type InspectorTarget =
  | { kind: "file"; node: FileNode; root: FileNode }
  | { kind: "duplicate-group"; group: DuplicateGroup }
  | { kind: "extension"; stats: FileTypeStats; topFiles: FileNode[] }
  | null;

interface InspectorProps {
  target: InspectorTarget;
  onOpenInFinder: (path: string) => void;
  onRescan: (path: string) => void;
  onMoveToTrash: (path: string) => void;
}

const INSIGHT_TEXT: Record<string, string> = {
  node_modules:  "Safe to delete — regenerate with `npm install`.",
  DerivedData:   "Xcode build cache — safe to delete, Xcode will rebuild.",
  __pycache__:   "Python bytecode cache — regenerated automatically.",
  ".dmg":        "Installer image — safe to delete after the app is installed.",
  ".pkg":        "Installer package — safe to delete after installation.",
};

function getInsightText(node: FileNode): string | null {
  if (INSIGHT_TEXT[node.name]) return INSIGHT_TEXT[node.name];
  const ext = "." + (node.name.split(".").pop()?.toLowerCase() ?? "");
  return INSIGHT_TEXT[ext] ?? null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)", marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{value}</div>
    </div>
  );
}

function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500,
        cursor: "pointer", fontFamily: "inherit", width: "100%",
        border: `1px solid ${color}33`, background: `${color}11`, color: color,
        transition: "filter 100ms",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.15)")}
      onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
    >{label}</button>
  );
}

function FileInspector({ node, root, onOpenInFinder, onRescan, onMoveToTrash }: {
  node: FileNode; root: FileNode;
  onOpenInFinder: (p: string) => void;
  onRescan: (p: string) => void;
  onMoveToTrash: (p: string) => void;
}) {
  const [trashArmed, setTrashArmed] = useState(false);

  useEffect(() => {
    setTrashArmed(false);
  }, [node.path]);

  useEffect(() => {
    if (!trashArmed) return;
    const t = setTimeout(() => setTrashArmed(false), 3000);
    return () => clearTimeout(t);
  }, [trashArmed]);

  const percentOfRoot = root.size > 0 ? ((node.size / root.size) * 100).toFixed(1) : "0";
  const insightText = getInsightText(node);
  const category = getFileCategory(node);
  const color = CATEGORY_COLORS[category];

  function handleTrash() {
    if (!trashArmed) { setTrashArmed(true); return; }
    setTrashArmed(false);
    onMoveToTrash(node.path);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "12px 16px", overflowY: "auto", flex: 1 }}>
      <Section title="Stats">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <StatCard label="Total size" value={formatSize(node.size)} />
          <StatCard label="% of scan" value={`${percentOfRoot}%`} />
          {node.is_dir && <StatCard label="Files" value={node.file_count.toLocaleString()} />}
          {node.is_dir && (
            <StatCard label="Folders" value={node.children.length.toLocaleString()} />
          )}
          {!node.is_dir && (
            <StatCard label="Type" value={category.charAt(0).toUpperCase() + category.slice(1)} />
          )}
        </div>
      </Section>

      {insightText && (
        <Section title="Insight">
          <div style={{
            background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.18)",
            borderRadius: 8, padding: "10px 12px",
          }}>
            <div style={{ fontSize: 11, color: "#fde68a", lineHeight: 1.5 }}>{insightText}</div>
          </div>
        </Section>
      )}

      <Section title="Actions">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <ActionBtn label="Show in Finder" color="var(--accent2)" onClick={() => onOpenInFinder(node.path)} />
          {node.is_dir && (
            <ActionBtn label="Rescan" color="var(--success)" onClick={() => onRescan(node.path)} />
          )}
          <ActionBtn
            label={trashArmed ? "Confirm? (click again)" : "Move to Trash"}
            color="var(--danger)"
            onClick={handleTrash}
          />
        </div>
      </Section>
    </div>
  );
}

function DuplicateInspector({ group, onMoveToTrash }: {
  group: DuplicateGroup; onMoveToTrash: (p: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "12px 16px", overflowY: "auto", flex: 1 }}>
      <Section title="Duplicate Group">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <StatCard label="Size each" value={formatSize(group.size)} />
          <StatCard label="Reclaimable" value={formatSize(group.total_wasted)} />
          <StatCard label="Copies" value={group.files.length.toString()} />
        </div>
      </Section>
      <Section title="Files">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {group.files.map((f, i) => (
            <div key={f.path} style={{ background: "var(--surface2)", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 11, color: i === 0 ? "var(--success)" : "var(--text2)", marginBottom: 2 }}>
                {i === 0 ? "Newest (kept)" : `Copy ${i + 1}`}
              </div>
              <div style={{ fontSize: 11, color: "var(--text3)", wordBreak: "break-all", lineHeight: 1.4, fontFamily: "'SF Mono','Fira Code',monospace" }}>
                {f.path}
              </div>
              {i > 0 && (
                <button
                  onClick={() => onMoveToTrash(f.path)}
                  style={{
                    marginTop: 6, padding: "4px 10px", borderRadius: 6,
                    border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.1)",
                    color: "var(--danger)", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                  }}
                >Delete this copy</button>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function ExtensionInspector({ stats, topFiles }: { stats: FileTypeStats; topFiles: FileNode[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "12px 16px", overflowY: "auto", flex: 1 }}>
      <Section title="Stats">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <StatCard label="Total size" value={formatSize(stats.totalSize)} />
          <StatCard label="File count" value={stats.count.toLocaleString()} />
          <StatCard label="Category" value={stats.category.charAt(0).toUpperCase() + stats.category.slice(1)} />
        </div>
      </Section>
      <Section title="Largest Files">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {topFiles.map((f) => (
            <div key={f.path} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 8px", background: "var(--surface2)", borderRadius: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.path}>
                {f.path.split("/").slice(-2).join("/")}
              </span>
              <span style={{ fontSize: 11, color: "var(--text3)", flexShrink: 0 }}>{formatSize(f.size)}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

export function Inspector({ target, onOpenInFinder, onRescan, onMoveToTrash }: InspectorProps) {
  const headerName = target == null
    ? null
    : target.kind === "file"
      ? target.node.name
      : target.kind === "duplicate-group"
        ? target.group.files[0]?.path.split("/").pop() ?? "Duplicate"
        : `.${target.stats.extension}`;

  const headerSub = target?.kind === "file" ? target.node.path : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)", marginBottom: 8 }}>
          Inspector
        </div>
        {headerName ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.3, wordBreak: "break-all" }}>
              {headerName}
            </div>
            {headerSub && (
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4, wordBreak: "break-all", lineHeight: 1.4, fontFamily: "'SF Mono','Fira Code',monospace" }}>
                {headerSub}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text3)" }}>Select a file or folder to inspect</div>
        )}
      </div>

      {target?.kind === "file" && (
        <FileInspector node={target.node} root={target.root} onOpenInFinder={onOpenInFinder} onRescan={onRescan} onMoveToTrash={onMoveToTrash} />
      )}
      {target?.kind === "duplicate-group" && (
        <DuplicateInspector group={target.group} onMoveToTrash={onMoveToTrash} />
      )}
      {target?.kind === "extension" && (
        <ExtensionInspector stats={target.stats} topFiles={target.topFiles} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/user/Projects/Apps/dirstat && npx tsc --noEmit 2>&1 | grep -v "InsightStrip\|LargeFilesView\|DuplicatesView\|FileTypesView"
```

Expected: No errors other than the still-missing view components.

- [ ] **Step 3: Commit**

```bash
git add src/Inspector.tsx
git commit -m "feat: inspector panel with file/duplicate/extension modes and inline trash confirm"
```

---

## Task 6: Insight Strip Component

**Files:**
- Create: `src/InsightStrip.tsx`

- [ ] **Step 1: Create src/InsightStrip.tsx**

```tsx
// src/InsightStrip.tsx
import { InsightResult } from "./insights";
import { formatSize } from "./utils";

interface InsightStripProps {
  insights: InsightResult[];
  onNavigate: (navTarget: "overview" | "large-files", filter: string) => void;
}

export function InsightStrip({ insights, onNavigate }: InsightStripProps) {
  if (insights.length === 0) return null;

  return (
    <div style={{
      background: "rgba(99,102,241,0.05)",
      borderBottom: "1px solid rgba(99,102,241,0.12)",
      padding: "7px 16px",
      display: "flex", alignItems: "center", gap: 8,
      flexShrink: 0, overflow: "hidden",
    }}>
      <span style={{ fontSize: 11, color: "var(--text3)", flexShrink: 0 }}>Detected:</span>
      <div style={{ display: "flex", gap: 6, overflow: "auto", flex: 1 }}>
        {insights.map((insight) => (
          <button
            key={insight.id}
            onClick={() => onNavigate(insight.navTarget, insight.filter)}
            title={`Click to navigate — ${insight.count} found, ${formatSize(insight.totalSize)} total`}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "var(--surface2)", border: "1px solid var(--border2)",
              borderRadius: 20, padding: "4px 10px",
              fontSize: 11, color: "var(--text2)", cursor: "pointer",
              fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap",
              transition: "border-color 100ms, color 100ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)";
              e.currentTarget.style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border2)";
              e.currentTarget.style.color = "var(--text2)";
            }}
          >
            <span>{insight.icon}</span>
            <span style={{ color: "var(--warning)", fontWeight: 700 }}>{insight.count}</span>
            <span>{insight.label}</span>
            <span style={{ color: "var(--text3)" }}>—</span>
            <span>{formatSize(insight.totalSize)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/InsightStrip.tsx
git commit -m "feat: insight strip with clickable pattern pills"
```

---

## Task 7: Large Files Tab

**Files:**
- Create: `src/LargeFilesView.tsx`

- [ ] **Step 1: Create src/LargeFilesView.tsx**

```tsx
// src/LargeFilesView.tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/LargeFilesView.tsx
git commit -m "feat: large files tab with size filter, sort, and search"
```

---

## Task 8: File Types Tab

**Files:**
- Create: `src/FileTypesView.tsx`

- [ ] **Step 1: Create src/FileTypesView.tsx**

```tsx
// src/FileTypesView.tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/FileTypesView.tsx
git commit -m "feat: file types tab with category bars and extension table"
```

---

## Task 9: Rust Duplicate Finder

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/duplicates.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/types.ts` (already updated in Task 4)

- [ ] **Step 1: Add sha2 dependency to Cargo.toml**

In `src-tauri/Cargo.toml`, add under `[dependencies]`:

```toml
sha2 = "0.10"
```

- [ ] **Step 2: Write failing Rust tests first**

Create `src-tauri/src/duplicates.rs` with the tests at the bottom but the public function stubbed out:

```rust
// src-tauri/src/duplicates.rs
use serde::Serialize;
use sha2::{Sha256, Digest};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Serialize, Clone, Debug)]
pub struct DuplicateFile {
    pub path: String,
    pub modified: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct DuplicateGroup {
    pub hash: String,
    pub size: u64,
    pub total_wasted: u64,
    pub files: Vec<DuplicateFile>,
}

pub fn find_duplicate_groups(root_path: &str) -> Result<Vec<DuplicateGroup>, String> {
    todo!()
}

fn collect_files_by_size(path: &Path, by_size: &mut HashMap<u64, Vec<String>>) {
    if path.is_symlink() { return; }
    if path.is_file() {
        if let Ok(meta) = path.metadata() {
            let size = meta.len();
            if size > 0 {
                by_size.entry(size).or_default()
                    .push(path.to_string_lossy().into_owned());
            }
        }
        return;
    }
    if path.is_dir() {
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                collect_files_by_size(&entry.path(), by_size);
            }
        }
    }
}

fn hash_file(path: &str) -> Result<String, std::io::Error> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65_536];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn get_mtime(path: &str) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| t.duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0))
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, File};
    use std::io::Write;

    fn tmp_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("dup_test_{}", rand_u64()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn rand_u64() -> u64 {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().subsec_nanos() as u64
    }

    fn write_file(path: &Path, content: &[u8]) {
        let mut f = File::create(path).unwrap();
        f.write_all(content).unwrap();
    }

    #[test]
    fn test_finds_identical_files() {
        let dir = tmp_dir();
        write_file(&dir.join("a.txt"), b"hello world");
        write_file(&dir.join("b.txt"), b"hello world");
        write_file(&dir.join("c.txt"), b"different");

        let groups = find_duplicate_groups(dir.to_str().unwrap()).unwrap();
        assert_eq!(groups.len(), 1, "should find exactly one duplicate group");
        assert_eq!(groups[0].files.len(), 2, "group should have 2 files");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_total_wasted_is_size_times_copies_minus_one() {
        let dir = tmp_dir();
        let content = b"duplicate content here";
        write_file(&dir.join("x.bin"), content);
        write_file(&dir.join("y.bin"), content);
        write_file(&dir.join("z.bin"), content);

        let groups = find_duplicate_groups(dir.to_str().unwrap()).unwrap();
        assert_eq!(groups.len(), 1);
        let g = &groups[0];
        assert_eq!(g.size, content.len() as u64);
        assert_eq!(g.total_wasted, content.len() as u64 * 2); // 3 copies − 1
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_no_duplicates_returns_empty() {
        let dir = tmp_dir();
        write_file(&dir.join("a.txt"), b"aaa");
        write_file(&dir.join("b.txt"), b"bbb");

        let groups = find_duplicate_groups(dir.to_str().unwrap()).unwrap();
        assert!(groups.is_empty());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_sorts_by_total_wasted_descending() {
        let dir = tmp_dir();
        // Small duplicate pair
        write_file(&dir.join("s1.txt"), b"small");
        write_file(&dir.join("s2.txt"), b"small");
        // Large duplicate pair
        let large = vec![0u8; 10_000];
        write_file(&dir.join("l1.bin"), &large);
        write_file(&dir.join("l2.bin"), &large);

        let groups = find_duplicate_groups(dir.to_str().unwrap()).unwrap();
        assert_eq!(groups.len(), 2);
        assert!(groups[0].total_wasted >= groups[1].total_wasted,
            "groups should be sorted by total_wasted descending");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_files_sorted_newest_first() {
        let dir = tmp_dir();
        let content = b"same content";
        write_file(&dir.join("old.txt"), content);
        std::thread::sleep(std::time::Duration::from_millis(10));
        write_file(&dir.join("new.txt"), content);

        let groups = find_duplicate_groups(dir.to_str().unwrap()).unwrap();
        assert_eq!(groups.len(), 1);
        let first_mtime = groups[0].files[0].modified;
        let second_mtime = groups[0].files[1].modified;
        assert!(first_mtime >= second_mtime, "newest file should be first");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_skips_empty_files() {
        let dir = tmp_dir();
        File::create(dir.join("empty1.txt")).unwrap();
        File::create(dir.join("empty2.txt")).unwrap();

        let groups = find_duplicate_groups(dir.to_str().unwrap()).unwrap();
        assert!(groups.is_empty(), "empty files should not be considered duplicates");
        fs::remove_dir_all(&dir).unwrap();
    }
}
```

- [ ] **Step 3: Run tests to confirm they fail (todo! panics)**

```bash
cd /Users/user/Projects/Apps/dirstat/src-tauri && cargo test duplicates -- --nocapture 2>&1 | tail -20
```

Expected: tests fail with "not yet implemented"

- [ ] **Step 4: Implement find_duplicate_groups**

Replace the `todo!()` in `find_duplicate_groups` with:

```rust
pub fn find_duplicate_groups(root_path: &str) -> Result<Vec<DuplicateGroup>, String> {
    // Step 1: collect all files grouped by size
    let mut by_size: HashMap<u64, Vec<String>> = HashMap::new();
    collect_files_by_size(Path::new(root_path), &mut by_size);

    // Step 2: only consider sizes with 2+ files (same size is necessary for duplicates)
    let candidates: Vec<(u64, Vec<String>)> = by_size
        .into_iter()
        .filter(|(_, files)| files.len() > 1)
        .collect();

    // Step 3: hash candidate files and group by hash
    let mut by_hash: HashMap<String, (u64, Vec<DuplicateFile>)> = HashMap::new();
    for (file_size, paths) in candidates {
        for path in paths {
            match hash_file(&path) {
                Ok(hash) => {
                    let mtime = get_mtime(&path);
                    let entry = by_hash.entry(hash).or_insert((file_size, Vec::new()));
                    entry.1.push(DuplicateFile { path, modified: mtime });
                }
                Err(_) => continue,
            }
        }
    }

    // Step 4: filter to actual duplicates, sort files newest-first within each group
    let mut groups: Vec<DuplicateGroup> = by_hash
        .into_iter()
        .filter(|(_, (_, files))| files.len() > 1)
        .map(|(hash, (size, mut files))| {
            files.sort_unstable_by(|a, b| b.modified.cmp(&a.modified));
            let total_wasted = size * (files.len() as u64 - 1);
            DuplicateGroup { hash, size, total_wasted, files }
        })
        .collect();

    // Sort groups by most reclaimable space first
    groups.sort_unstable_by(|a, b| b.total_wasted.cmp(&a.total_wasted));

    Ok(groups)
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/user/Projects/Apps/dirstat/src-tauri && cargo test duplicates -- --nocapture
```

Expected: All 6 tests PASS.

- [ ] **Step 6: Register the module and add the Tauri command**

In `src-tauri/src/lib.rs`, add `mod duplicates;` after the existing `mod` declarations:

```rust
mod duplicates;
```

In `src-tauri/src/commands.rs`, add at the top of imports:

```rust
use crate::duplicates::{DuplicateGroup, find_duplicate_groups};
```

Then add the command function after the existing commands:

```rust
#[tauri::command]
pub async fn find_duplicates(path: String) -> Result<Vec<DuplicateGroup>, String> {
    if !Path::new(&path).exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    tauri::async_runtime::spawn_blocking(move || find_duplicate_groups(&path))
        .await
        .map_err(|e| e.to_string())?
}
```

In `src-tauri/src/lib.rs`, add `commands::find_duplicates` to the `generate_handler!` macro:

```rust
.invoke_handler(tauri::generate_handler![
    commands::scan,
    commands::cancel_scan,
    commands::move_to_trash,
    commands::open_in_explorer,
    commands::find_duplicates,
])
```

- [ ] **Step 7: Run all Rust tests**

```bash
cd /Users/user/Projects/Apps/dirstat/src-tauri && cargo test
```

Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/duplicates.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: Rust find_duplicates command using SHA-256 file hashing"
```

---

## Task 10: Duplicates Tab UI

**Files:**
- Create: `src/DuplicatesView.tsx`

- [ ] **Step 1: Create src/DuplicatesView.tsx**

```tsx
// src/DuplicatesView.tsx
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
                          onClick={(e) => { e.stopPropagation(); onMoveToTrash(f.path); setGroups(prev => prev ? prev.map(g => g.hash === group.hash ? { ...g, files: g.files.filter(x => x.path !== f.path), total_wasted: g.size * (g.files.length - 2) } : g).filter(g => g.files.length > 1) : prev); }}
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
```

- [ ] **Step 2: Run type-check — should now be clean**

```bash
cd /Users/user/Projects/Apps/dirstat && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/DuplicatesView.tsx
git commit -m "feat: duplicates tab UI with group cards and inline delete"
```

---

## Task 11: Smoke Test + Final Polish

**Files:**
- Modify: `src/Treemap.tsx` (use CSS vars for non-tile chrome colors)

- [ ] **Step 1: Fix tab rendering to preserve state across tab switches**

The spec requires tab state (sort order, scroll position, filters) to persist when switching tabs. Conditional rendering (`activeTab === "X" && <View />`) unmounts components on tab switch. Fix by rendering all views simultaneously and toggling visibility with `display`.

In `src/App.tsx`, replace the four conditional view renders in the `leftPanel` prop with a single wrapper that renders all views inside `display: none` divs for inactive tabs:

```tsx
leftPanel={
  <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
    {/* Error / cancelled / loading / empty banners */}
    {error && ( /* ... same error div as before ... */ )}
    {cancelled && ( /* ... same cancelled div ... */ )}
    {loading && ( /* ... same loading div ... */ )}
    {!result && !loading && !error && !cancelled && ( /* ... same empty state ... */ )}

    {/* All tab content — always rendered after first scan, hidden when inactive */}
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
          />
        </div>
        <div style={{ display: activeTab === "large-files" && !loading ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <LargeFilesView
            root={result}
            onSelect={(node) => setInspectorTarget({ kind: "file", node, root: result })}
            onOpenInFinder={(p) => handleOpenInExplorer(p)}
            onMoveToTrash={(p) => handleMoveToTrash(p)}
          />
        </div>
        <div style={{ display: activeTab === "duplicates" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <DuplicatesView
            scanPath={path}
            scanResult={result}
            onSelectGroup={(group) => setInspectorTarget({ kind: "duplicate-group", group })}
            onMoveToTrash={(p) => handleMoveToTrash(p)}
          />
        </div>
        <div style={{ display: activeTab === "file-types" && !loading ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <FileTypesView
            root={result}
            onSelectExtension={(stats, topFiles) =>
              setInspectorTarget({ kind: "extension", stats, topFiles })
            }
          />
        </div>
      </>
    )}
  </div>
}
```

- [ ] **Step 2: Add Backspace key for treemap back-navigation**

The spec keyboard table includes `Backspace → Treemap: navigate up one level`. Implement by adding a `onBackRequest` prop to `TreemapView`.

In `src/Treemap.tsx`, add `onBackRequest?: () => void` to `TreemapViewProps`:

```tsx
interface TreemapViewProps {
  // ... existing props ...
  onBackRequest?: () => void;
}
```

Inside `TreemapView`, add a `useEffect` that calls `navigateTo(navPath.length - 2)` when `onBackRequest` fires. Use a counter pattern (same as `drillRequest`):

```tsx
// In TreemapViewProps:
backRequest: number; // increment to trigger; 0 = no request

// In TreemapView, add:
useEffect(() => {
  if (backRequest === 0) return;
  if (navPath.length > 1) navigateTo(navPath.length - 2);
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [backRequest]);
```

In `src/App.tsx`, add state:
```tsx
const [treemapBackRequest, setTreemapBackRequest] = useState(0);
```

In the keyboard handler `useEffect`, add:
```tsx
if (e.key === "Backspace" && activeTab === "overview" && overviewSubView === "treemap") {
  const target = document.activeElement?.tagName;
  if (target !== "INPUT" && target !== "TEXTAREA") {
    e.preventDefault();
    setTreemapBackRequest(n => n + 1);
  }
  return;
}
```

Pass `backRequest={treemapBackRequest}` to `<TreemapView ... />` inside `OverviewPanel` (add `backRequest` and `onBackRequest` to `OverviewPanel`'s props and thread them through).

- [ ] **Step 3: Update Treemap.tsx chrome colors to use CSS variables**

In `src/Treemap.tsx`, update the breadcrumb nav and legend to use CSS variables instead of hardcoded hex colors.

The nav container:
```tsx
<nav style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2, flexShrink: 0 }}>
```

Crumb buttons — active crumb:
```tsx
style={{
  padding: "3px 8px", borderRadius: 6, border: "none",
  background: isLast ? "rgba(255,255,255,0.08)" : "transparent",
  color: isLast ? "var(--text)" : "var(--text3)",
  fontSize: 13, fontWeight: isLast ? 600 : 400,
  cursor: isLast ? "default" : "pointer",
  transition: "background 120ms, color 120ms",
}}
```

The separator span:
```tsx
<span style={{ color: "var(--text3)", margin: "0 4px", userSelect: "none" }}>›</span>
```

The legend items:
```tsx
style={{
  display: "flex", alignItems: "center", gap: 6,
  fontSize: 11, cursor: "pointer", userSelect: "none",
  color: hidden ? "var(--text3)" : "var(--text2)",
  textDecoration: hidden ? "line-through" : "none",
  transition: "color 120ms",
}}
```

The "Reset" button:
```tsx
style={{ marginLeft: "auto", fontSize: 11, color: "var(--accent2)", cursor: "pointer", userSelect: "none" }}
```

The treemap canvas background:
```tsx
style={{
  flex: "1 1 0", minHeight: 300, borderRadius: 10, overflow: "hidden",
  background: "var(--bg)", border: "1px solid var(--border)",
}}
```

The `.tm-crumb` hover CSS (replace the inline `<style>` tag):
```tsx
<style>{`.tm-crumb:hover { background: var(--surface2) !important; color: var(--text) !important; }`}</style>
```

- [ ] **Step 4: Start the dev server and verify the app loads**

```bash
cd /Users/user/Projects/Apps/dirstat && npm run tauri dev
```

Expected: App opens. Dark theme applied. Header shows DirStat logo + theme toggle.

- [ ] **Step 5: Verify core flows manually**

In the running app, test each flow:

1. Enter a real directory path (e.g. `/Users/<you>/Downloads`) and press Scan. Confirm: progress shown, treemap renders, status bar shows file count and duration.
2. Click a treemap tile. Confirm: inspector shows stats + actions.
3. Click theme toggle. Confirm: switches to light theme and back.
4. Switch to Large Files tab, change the min size filter, then switch to File Types and back — confirm filter is still set when returning.
5. Switch to File Types tab. Confirm: category bars show. Click an extension row, inspector updates.
6. Switch to Duplicates tab. Click "Find Duplicates". Confirm: spinner shows then results appear.
7. Select a file in inspector and click "Move to Trash" twice (inline confirm). Confirm: file removed.
8. Press `2`, `3`, `4`, `1` — confirm tab switching via keyboard.
9. In treemap, double-click to drill in. Press Backspace — confirm navigates up one level.

- [ ] **Step 6: Run full test suite**

```bash
cd /Users/user/Projects/Apps/dirstat && npm test && (cd src-tauri && cargo test)
```

Expected: All tests PASS.

- [ ] **Step 7: Type-check final**

```bash
cd /Users/user/Projects/Apps/dirstat && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 8: Final commit**

```bash
git add src/Treemap.tsx
git commit -m "feat: Treemap CSS variable updates, complete professional UX redesign"
```
