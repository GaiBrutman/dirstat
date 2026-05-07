# DirStat — Professional UX Redesign

**Date:** 2026-05-04
**Status:** Approved for implementation

---

## Goals

Transform DirStat from a functional prototype into a polished, professional disk-usage analyzer. The core job is: *"I'm running low on disk space — help me find and delete the big stuff fast."* Every design decision should serve that job for both novice and power users.

---

## Layout: Two-Panel Inspector (Option B)

```
┌─────────────────────────────────────────────────────────────┐
│  Titlebar (traffic lights · DirStat logo)                   │
├─────────────────────────────────────────────────────────────┤
│  Toolbar: [path input ──────────────] [filter] [Scan]       │
├─────────────────────────────────────────────────────────────┤
│  Nav tabs: Overview | Large Files (12) | Duplicates | Types │
├─────────────────────────────────────────────────────────────┤
│  Insight strip: ⚡ 14 node_modules 8.3 GB │ 🗂 847 dupes …  │
├──────────────────────────────────┬──────────────────────────┤
│                                  │                          │
│   Visualization panel            │   Inspector panel        │
│   (flex: 1)                      │   (width: 280px)         │
│                                  │                          │
│   ─ Breadcrumb nav (treemap)     │   ─ Selected item name   │
│   ─ Treemap / Tree / Large /     │   ─ Full path            │
│     Duplicates / Types view      │   ─ Stats grid           │
│                                  │   ─ Contents by type     │
│                                  │   ─ Contextual insight   │
│                                  │   ─ Actions              │
│                                  │                          │
├──────────────────────────────────┴──────────────────────────┤
│  Status bar: ● Scan complete · 18.4 GB · 87k files · 2.3s  │
└─────────────────────────────────────────────────────────────┘
```

The inspector is **always visible** when a node is selected, across all tabs. When nothing is selected it shows an empty state ("Select a file or folder to inspect").

---

## Navigation Tabs

Four top-level tabs. Tab state (scroll position, sort order, filters) is preserved when switching between tabs.

| Tab | Content | Badge |
|-----|---------|-------|
| **Overview** | Treemap + Tree toggle (existing) | — |
| **Large Files** | Flat sortable list of biggest files | count of files > 100 MB |
| **Duplicates** | Grouped duplicate sets with reclaimable space | total reclaimable GB |
| **File Types** | Full-width category analytics view | — |

---

## Smart Insight Strip

Computed after every scan. Analyzes the full tree and surfaces actionable patterns as clickable pills.

**Pill navigation behavior:**

- Directory patterns (node\_modules, DerivedData, cache dirs, \_\_pycache\_\_) → clicking switches to the **Overview tab** and pre-populates the tree search filter with the pattern name, revealing all matching nodes.
- File-extension patterns (.dmg, .pkg) → clicking switches to the **Large Files tab** filtered to that extension.

**Patterns detected (frontend, no extra Rust needed):**

- `node_modules` folders — sum of all matching directory sizes
- `.dmg` / `.pkg` installer files — aggregated by extension
- `Xcode DerivedData` — detected by known path pattern
- Cache directories (`Library/Caches`, `~/.cache`, `.gradle/caches`)
- `__pycache__` / `.pytest_cache` / `.mypy_cache`

Each pill shows: icon · label · count · total size. If no patterns are found, the strip is hidden.

---

## Inspector Panel

The inspector shows context-sensitive information about the selected node.

**Stats grid (2×2):**
- Total size (large, prominent)
- File count
- Folder count
- % of scanned root (not % of parent — more actionable)

**Contents by type** (directories only):
- Horizontal bar per category (JS, JSON, Images, Video, etc.)
- Bar width = proportion of directory size
- Label shows category name and size

**Contextual insight card** (shown when a recognized pattern is detected):
- Brief plain-language explanation of what the folder is and why it's safe to delete
- "→ Find all X" link that switches to Overview and pre-fills the tree search with the pattern name, surfacing all instances

**Known patterns with insight text:**
- `node_modules` — "Safe to delete; regenerate with `npm install`"
- `DerivedData` — "Xcode build cache; safe to delete, Xcode will rebuild"
- `.dmg` files — "Installer images; safe to delete after apps are installed"
- `__pycache__` — "Python bytecode cache; regenerated automatically"
- `Library/Caches` — "App caches; safe to delete, apps will rebuild"

**Actions:**
- Show in Finder (all nodes)
- Rescan (directories only)
- Move to Trash (all nodes, with confirmation)

---

## Overview Tab

Unchanged in functionality, redesigned in appearance:

- Treemap / Tree toggle moves into the tab bar (Overview has a sub-toggle)
- Breadcrumb navigation above the treemap
- Treemap filter input in the toolbar (only visible on Overview)
- Legend at the bottom (toggle categories)

---

## Large Files Tab

A flat, sorted list of the largest files anywhere in the scanned tree — no directory nesting.

**Computed from existing scan data** (traverse tree, collect leaf nodes, sort by size descending). No new Rust command needed.

**Controls:**
- Minimum size filter: dropdown (All / >10 MB / >100 MB / >500 MB / >1 GB), default: >100 MB
- Sort: Size (default), Name, Path, Type
- Search: filter by filename substring

**List columns:**
- File icon (category color dot)
- Name
- Path (truncated, full path on hover)
- Size (right-aligned, human-readable)
- Inline actions: Show in Finder · Move to Trash

**Selecting a row** populates the inspector (stats, insight if applicable, actions).

---

## Duplicates Tab

Requires a new Rust command: `find_duplicates(path: String) → Vec<DuplicateGroup>`.

**Rust implementation:**
- Walk the tree (reusing the existing scanner's file list where possible)
- Group files by size first (fast pre-filter — files with unique sizes cannot be duplicates)
- Hash only files that share a size (xxHash or SHA-256; xxHash preferred for speed)
- Return groups of 2+ files with identical hashes

**`DuplicateGroup` struct:**
```rust
struct DuplicateGroup {
    hash: String,
    size: u64,         // size of one copy
    total_wasted: u64, // size × (count - 1)
    files: Vec<String> // absolute paths
}
```

**UI:**
- Header: "X duplicate sets · Y GB reclaimable"
- Each group shows as a card: file name, size per copy, paths list, "Keep newest / Delete rest" action (newest = most recently modified by mtime)
- Groups sorted by `total_wasted` descending (most reclaimable first)
- Scanning for duplicates is a separate action (button: "Find Duplicates") triggered after the main scan — it can be slow for large trees
- Progress indicator while hashing

**Selecting a group** shows the group in the inspector with a special "Duplicates" view (list of paths, keep/delete controls).

---

## File Types Tab

Full-width analytics view showing disk usage by file category and extension.

**Two sections:**

**1. Category breakdown** (top half):
- Horizontal bar chart, one bar per category (Images, Video, Code, Documents, Archives, Other)
- Each bar: colored fill proportional to size, label with size and percentage
- Clicking a category row filters the extension table below

**2. Top extensions table** (bottom half):
- Columns: Extension · Category · File Count · Total Size · % of Total
- Sorted by Total Size descending by default
- Clicking a row selects it; inspector shows: extension name, total size, file count, and a list of the 5 largest individual files of that type with their paths

No new Rust data needed — computed from the existing `FileNode` tree.

---

## Adaptive Theme

System preference is detected via `prefers-color-scheme` media query on startup. A manual toggle in the title bar overrides the system preference and persists in `localStorage`.

**Design token sets** (CSS custom properties):

| Token | Dark | Light |
|-------|------|-------|
| `--bg` | `#0f0f11` | `#f5f5f7` |
| `--surface` | `#18181b` | `#ffffff` |
| `--surface2` | `#222226` | `#f0f0f2` |
| `--border` | `rgba(255,255,255,0.07)` | `rgba(0,0,0,0.08)` |
| `--text` | `#e4e4e7` | `#111113` |
| `--text2` | `#a1a1aa` | `#52525b` |
| `--text3` | `#52525b` | `#a1a1aa` |
| `--accent` | `#6366f1` | `#4f46e5` |

Treemap tile colors stay the same in both themes (they are already high-contrast against dark). Tree view row backgrounds adapt.

---

## Visual Design System

**Typography:**
- UI chrome: system-ui stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`)
- Monospace (paths, hashes): `"SF Mono", "Fira Code", "Cascadia Code", monospace`
- Font sizes: 10px (labels), 11px (secondary), 12px (body), 13px (primary), 15px (inspector title), 18px (stat values)

**Spacing:** 6px base unit — all padding/gap values are multiples of 6.

**Border radius:** 8px standard, 10px for panels, 5px for inline elements.

**Transitions:** 100ms for hover states, 150ms for panel state changes.

---

## Status Bar

Persistent bottom bar. Always visible.

Content when idle: "Enter a path and press Scan"
Content after scan: `● Scan complete · {total size} · {file count} files · {folder count} folders · Scanned in {duration}s`
Content while scanning: spinner + "Scanning… {count} items · {current_path}"

---

## File Operations (unchanged behavior, improved placement)

All existing file operations (Open in Finder, Move to Trash, Rescan) move exclusively into the inspector panel. The current action bar above the tree is removed — the inspector replaces it cleanly.

The `window.confirm()` dialog for trash is replaced with an inline confirmation: the Trash button becomes "Confirm?" for 3 seconds on first click, then executes on second click.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Scan |
| `Escape` | Cancel scan / clear search |
| `1` / `2` / `3` / `4` | Switch tabs (Overview / Large Files / Duplicates / File Types) |
| `Backspace` | Treemap: navigate up one level |
| `Delete` / `⌘⌫` | Move selected to Trash |
| `Space` | Show selected in Finder |
| `⌘F` | Focus filter/search input |

---

## Components

New or significantly changed components:

| Component | Description |
|-----------|-------------|
| `Layout.tsx` | Top-level shell: titlebar, toolbar, tabs, insight strip, main split, status bar |
| `Inspector.tsx` | Right panel; receives selected `FileNode` or `null` |
| `InsightStrip.tsx` | Parses scan tree for patterns, renders pills |
| `LargeFilesView.tsx` | Flat file list with sort/filter controls |
| `DuplicatesView.tsx` | Duplicate groups UI; triggers `find_duplicates` command |
| `FileTypesView.tsx` | Category bars + extension table |
| `StatusBar.tsx` | Bottom status bar |
| `ThemeProvider.tsx` | CSS variable injection + toggle |

Existing components that remain:
- `Treemap.tsx` — minor visual updates only
- `TreeNode.tsx` — minor visual updates only
- `ContextMenu.tsx` — unchanged

---

## Rust Changes

| Command | Change |
|---------|--------|
| `scan` | Unchanged |
| `cancel_scan` | Unchanged |
| `open_in_explorer` | Unchanged |
| `move_to_trash` | Unchanged |
| `find_duplicates` | **New** — accepts `path: String`, returns `Vec<DuplicateGroup>` |

`find_duplicates` emits progress events (`duplicates_progress`) with `{ hashed: u64, total: u64 }` so the UI can show a progress bar.

---

## Out of Scope

- Live filesystem watch (`notify` crate) — deferred
- Scan history / comparison — deferred
- Export to PDF/CSV — deferred
- Sunburst chart view — deferred
