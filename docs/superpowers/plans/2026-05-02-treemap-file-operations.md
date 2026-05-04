# Treemap File Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the treemap self-sufficient by adding right-click context menu (Open in Finder, Rescan, Move to Trash), a name search input in the toolbar, and a clickable category-filter legend — removing the need to switch to tree view for any file operation.

**Architecture:** `ContextMenu.tsx` is a new portal-rendered component wired at App level, calling handlers that already exist (`handleOpenInExplorer`, `handleRescan`, `handleMoveToTrash`). `App.tsx` gains a `treemapSearch` state (separate from tree view's `searchQuery`), a `drillRequest` state, and a `contextMenu` state; the action bar is scoped to tree view only. `Treemap.tsx` finally receives all the props its interface already declares, gains an `onContextMenu` prop, and upgrades its static legend into interactive category toggles via local `hiddenCategories` state.

**Tech Stack:** React 18, TypeScript, Tauri v2, d3-hierarchy (already in use), `ReactDOM.createPortal`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/ContextMenu.tsx` | Portal context menu with header, actions, keyboard/click-outside dismiss |
| Modify | `src/App.tsx` | Wire all TreemapView props; add `treemapSearch`, `drillRequest`, `contextMenu` state; name search input in scan row; scope action bar to tree; render `<ContextMenu>` |
| Modify | `src/Treemap.tsx` | Consume all props; add `onContextMenu` prop + right-click on tiles; add `hiddenCategories` local state + interactive legend |

---

## Task 1: Wire all TreemapView props from App

Currently `App.tsx` line 510 renders `<TreemapView root={result} />` — all other declared props are missing, breaking TypeScript and leaving selection/search/drill dead.

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add `drillRequest` state** near the other state declarations (after line 293):

```tsx
const [drillRequest, setDrillRequest] = useState<string | null>(null);
```

- [ ] **Step 2: Replace the `<TreemapView>` call** (line 510) with the fully-wired version:

```tsx
<TreemapView
  root={result}
  selectedPath={selectedPath}
  onSelect={setSelectedPath}
  searchQuery=""
  drillRequest={drillRequest}
  onDrillRequestHandled={() => setDrillRequest(null)}
/>
```

(`searchQuery=""` is a placeholder — Task 2 replaces it with real state.)

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "fix: wire all TreemapView props from App"
```

---

## Task 2: Add treemap name search input

The `searchQuery` prop already drives filtering in `Treemap.tsx` (lines 67–71 fully hide non-matching tiles). We just need state + UI in App.

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add `treemapSearch` state** after the `drillRequest` state from Task 1:

```tsx
const [treemapSearch, setTreemapSearch] = useState("");
```

- [ ] **Step 2: Reset it on full scan** — inside `handleScan`, in the `finally` block (after line 359, alongside the existing `setSearchQuery("")`):

```tsx
if (!scanPath) {
  setSearchQuery("");
  setTreemapSearch("");    // add this line
}
```

- [ ] **Step 3: Add the search input to the scan row** — inside the `<div style={S.scanRow}>` (between the path input and the Scan button, lines 410–431), add:

```tsx
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
```

- [ ] **Step 4: Pass the real value** — update the `<TreemapView>` call from Task 1, replacing `searchQuery=""` with:

```tsx
searchQuery={treemapSearch}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Smoke-test** — `npm run tauri dev`, scan a directory, type in the filter box, verify only matching tiles remain and the treemap reflows. Clear with ×, verify all tiles return.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat: treemap name search filter in toolbar"
```

---

## Task 3: Interactive category legend

Replace the static legend in `Treemap.tsx` (lines 267–274) with clickable toggles. Add `hiddenCategories` local state and extend the existing `filteredChildren` memoization to exclude hidden categories.

**Files:**
- Modify: `src/Treemap.tsx`

- [ ] **Step 1: Add `hiddenCategories` state** at the top of `TreemapView`, after line 50:

```tsx
const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
```

- [ ] **Step 2: Reset on new scan** — the existing `useEffect` at line 52 resets `navPath` when `root` changes. Add a second reset effect directly after it:

```tsx
useEffect(() => { setHiddenCategories(new Set()); }, [root]);
```

- [ ] **Step 3: Extend `filteredChildren`** — the memoization at lines 67–71 currently filters by name. Add category filtering:

```tsx
const filteredChildren = useMemo(() => {
  return currentNode.children
    .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(c => !hiddenCategories.has(getCategory(c)));
}, [currentNode, searchQuery, hiddenCategories]);
```

- [ ] **Step 4: Replace the static legend** (lines 267–274) with the interactive version:

```tsx
<div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", flexShrink: 0, paddingBottom: "2px", alignItems: "center" }}>
  {Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
    const hidden = hiddenCategories.has(cat);
    return (
      <span
        key={cat}
        onClick={() =>
          setHiddenCategories(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat); else next.add(cat);
            return next;
          })
        }
        title={hidden ? "Click to show" : "Click to hide"}
        style={{
          display: "flex", alignItems: "center", gap: "6px",
          fontSize: "11px", cursor: "pointer", userSelect: "none",
          color: hidden ? "#3f3f46" : "#6b7280",
          textDecoration: hidden ? "line-through" : "none",
          transition: "color 120ms",
        }}
      >
        <span style={{
          display: "inline-block", width: "10px", height: "10px",
          borderRadius: "3px", flexShrink: 0,
          backgroundColor: CATEGORY_COLORS[cat],
          opacity: hidden ? 0.25 : 1,
          transition: "opacity 120ms",
        }} />
        {label}
      </span>
    );
  })}
  {hiddenCategories.size > 0 && (
    <span
      onClick={() => setHiddenCategories(new Set())}
      style={{ marginLeft: "auto", fontSize: "11px", color: "#3b82f6", cursor: "pointer", userSelect: "none" }}
    >
      Reset
    </span>
  )}
</div>
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Smoke-test** — `npm run tauri dev`, click category swatches, verify those tiles disappear and the treemap reflows. Click Reset, verify all return. Confirm name search + category filter stack (filter by category first, then name search within).

- [ ] **Step 7: Commit**

```bash
git add src/Treemap.tsx
git commit -m "feat: interactive category filter in treemap legend"
```

---

## Task 4: Create ContextMenu component

**Files:**
- Create: `src/ContextMenu.tsx`

- [ ] **Step 1: Create `src/ContextMenu.tsx`** with the full implementation:

```tsx
import { useEffect } from "react";
import ReactDOM from "react-dom";
import { FileNode } from "./types";
import { formatSize } from "./utils";

interface ContextMenuProps {
  x: number;
  y: number;
  node: FileNode;
  onOpenInFinder: () => void;
  onRescan: () => void;
  onMoveToTrash: () => void;
  onClose: () => void;
}

export function ContextMenu({ x, y, node, onOpenInFinder, onRescan, onMoveToTrash, onClose }: ContextMenuProps) {
  // Close on outside mousedown
  useEffect(() => {
    const handler = () => onClose();
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Clamp position so menu never overflows the viewport
  const menuWidth = 200;
  const menuHeight = 160;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 8);

  return ReactDOM.createPortal(
    <div
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: "fixed",
        top: clampedY,
        left: clampedX,
        background: "#1c1c2e",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "10px",
        padding: "4px 0",
        minWidth: menuWidth,
        boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
        zIndex: 9999,
        fontSize: "13px",
        color: "#e4e4e7",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ padding: "8px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: "4px" }}>
        <div style={{ fontWeight: 600, color: "#fafafa", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {node.name}
        </div>
        <div style={{ color: "#71717a", fontSize: "11px", marginTop: "2px" }}>
          {formatSize(node.size)} · {node.is_dir ? "directory" : "file"}
        </div>
      </div>

      <MenuItem icon="📂" label="Open in Finder" onClick={onOpenInFinder} />
      <MenuItem
        icon="🔄"
        label="Rescan Directory"
        onClick={onRescan}
        disabled={!node.is_dir}
        badge={!node.is_dir ? "dirs only" : undefined}
      />
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", margin: "4px 0" }} />
      <MenuItem icon="🗑️" label="Move to Trash" onClick={onMoveToTrash} danger />
    </div>,
    document.body
  );
}

function MenuItem({
  icon, label, onClick, disabled, badge, danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  badge?: string;
  danger?: boolean;
}) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}
      style={{
        padding: "6px 14px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        cursor: disabled ? "default" : "pointer",
        color: disabled ? "#52525b" : danger ? "#f87171" : "#e4e4e7",
        userSelect: "none",
      }}
    >
      <span style={{ opacity: disabled ? 0.4 : 1, fontSize: "15px" }}>{icon}</span>
      <span>{label}</span>
      {badge && (
        <span style={{
          fontSize: "9px",
          background: "rgba(255,255,255,0.07)",
          padding: "1px 6px",
          borderRadius: "4px",
          marginLeft: "auto",
          color: "#71717a",
        }}>
          {badge}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/ContextMenu.tsx
git commit -m "feat: ContextMenu portal component"
```

---

## Task 5: Wire right-click in Treemap and context menu in App

**Files:**
- Modify: `src/Treemap.tsx` — add `onContextMenu` prop; attach right-click handler to tiles
- Modify: `src/App.tsx` — add `contextMenu` state; render `<ContextMenu>`; pass `onContextMenu` to `<TreemapView>`

### 5a — Treemap changes

- [ ] **Step 1: Add `onContextMenu` to the props interface** (lines 37–44):

```tsx
interface TreemapViewProps {
  root: FileNode;
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
  searchQuery: string;
  drillRequest: string | null;
  onDrillRequestHandled: () => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
}
```

- [ ] **Step 2: Destructure the new prop** (line 46):

```tsx
export function TreemapView({ root, selectedPath, onSelect, searchQuery, drillRequest, onDrillRequestHandled, onContextMenu }: TreemapViewProps) {
```

- [ ] **Step 3: Attach `onContextMenu` to each tile's `<g>`** (around line 207). The `<g>` currently has `onClick` and mouse events — add:

```tsx
<g
  key={fileNode.path}
  onClick={() => handleTileClick(fileNode)}
  onMouseEnter={() => setHoveredPath(fileNode.path)}
  onMouseLeave={() => setHoveredPath(null)}
  onContextMenu={e => {
    e.preventDefault();
    onSelect(fileNode.path);
    onContextMenu(e, fileNode);
  }}
  style={{ cursor: "pointer" }}
>
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

### 5b — App changes

- [ ] **Step 5: Import `ContextMenu`** at the top of `App.tsx`:

```tsx
import { ContextMenu } from "./ContextMenu";
```

- [ ] **Step 6: Add `contextMenu` state** after the `treemapSearch` state:

```tsx
const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null);
```

- [ ] **Step 7: Add `handleContextMenu`** after `handleRescan` (around line 389):

```tsx
function handleContextMenu(e: React.MouseEvent, node: FileNode) {
  e.preventDefault();
  setContextMenu({ x: e.clientX, y: e.clientY, node });
}
```

- [ ] **Step 8: Pass `onContextMenu` to `<TreemapView>`** (line 510 area):

```tsx
<TreemapView
  root={result}
  selectedPath={selectedPath}
  onSelect={setSelectedPath}
  searchQuery={treemapSearch}
  drillRequest={drillRequest}
  onDrillRequestHandled={() => setDrillRequest(null)}
  onContextMenu={handleContextMenu}
/>
```

- [ ] **Step 9: Render `<ContextMenu>`** — add this just before the closing `</div>` of the app root (line 522):

```tsx
{contextMenu && (
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    node={contextMenu.node}
    onOpenInFinder={() => { handleOpenInExplorer(); setContextMenu(null); }}
    onRescan={() => { handleRescan(); setContextMenu(null); }}
    onMoveToTrash={() => { handleMoveToTrash(); setContextMenu(null); }}
    onClose={() => setContextMenu(null)}
  />
)}
```

- [ ] **Step 10: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 11: Smoke-test** — `npm run tauri dev`:
  - Right-click a directory tile → menu appears with correct name/size/type
  - "Open in Finder" → macOS Finder opens to that path
  - "Rescan Directory" → subtree rescans and treemap updates
  - "Move to Trash" → confirmation dialog appears; on confirm, tile disappears and parent sizes update
  - Right-click a file tile → "Rescan Directory" is greyed with "dirs only" badge
  - Click outside menu → dismisses
  - Press Escape → dismisses

- [ ] **Step 12: Commit**

```bash
git add src/Treemap.tsx src/App.tsx src/ContextMenu.tsx
git commit -m "feat: right-click context menu on treemap tiles"
```

---

## Task 6: Scope action bar to tree view only

The action bar (lines 453–468) currently shows for both views. It should only appear in tree view now that the treemap has its own context menu.

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add `view === "tree"` guard** to the action bar condition (line 453). Change:

```tsx
{result && !loading && selectedPath && (
```

to:

```tsx
{result && !loading && selectedPath && view === "tree" && (
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Verify both views** — `npm run tauri dev`:
  - In treemap view: no action bar appears after clicking or right-clicking a tile; context menu is the only operation surface
  - In tree view: action bar still appears on selection with Show in Finder / Rescan / Move to Trash working as before
  - Switching from treemap (with selection) to tree view: action bar appears for the selected path

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: scope action bar to tree view; treemap uses context menu"
```

---

## Verification Checklist

Run through this after all tasks are complete:

- [ ] Right-click any treemap tile → context menu appears at cursor with correct name + size + type
- [ ] Right-click file tile → Rescan greyed with "dirs only" badge
- [ ] Open in Finder → Finder reveals correct path
- [ ] Rescan on a directory → subtree updates, sizes recalculate
- [ ] Move to Trash → confirmation dialog; on confirm tile removed and parent sizes update; on cancel nothing happens
- [ ] Click outside context menu → dismisses
- [ ] Escape key → dismisses context menu
- [ ] Name search input appears only in treemap view, disappears in tree view
- [ ] Typing in name filter → non-matching tiles fully hidden; treemap reflows
- [ ] Clearing filter (× or Escape) → all tiles return
- [ ] Name filter resets when new scan starts
- [ ] Clicking category swatch → tiles of that category hidden; swatch struck-through; treemap reflows
- [ ] Clicking same swatch again → category restored
- [ ] "Reset" link appears when any category hidden; click restores all
- [ ] Name search + category filter stack correctly
- [ ] Category filter resets on new scan
- [ ] Tree view unchanged: action bar, search, expand/collapse all work
- [ ] `npx tsc --noEmit` → 0 errors
