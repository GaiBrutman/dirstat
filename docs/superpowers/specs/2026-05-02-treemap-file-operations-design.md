# Treemap File Operations Design

**Date:** 2026-05-02
**Status:** Approved

## Context

The treemap is the primary view of DirStat. The tree view is secondary — useful only when a user wants to see all files in a directory, including the ones too small to render as visible tiles. Currently, all file operations (Open in Finder, Rescan, Move to Trash) live behind the tree view's action bar, making them completely inaccessible from the treemap. The name search filter also only works in the tree view. This design brings the full operation set into the treemap.

## Design Decisions

| Topic | Decision |
|---|---|
| Interaction model | Right-click context menu on any tile |
| Filter — name | Text input in top toolbar; hides non-matching tiles (full hide, not dim) |
| Filter — category | Clickable swatches in the bottom legend; hides entire category and reflows d3 layout |
| Filter placement | Search in top bar row 1; category filter replaces static legend at bottom |
| Action bar | Removed — operations move entirely to the context menu |
| Tree view | Kept as a secondary toggle; its action bar remains for that view |

---

## Layout Changes

### Top bar (App.tsx row 1)

Current:
```
[/path/input ············] [Scan] [Cancel?]  [Treemap|Tree]
```

New:
```
[/path/input ·········] [🔍 Filter by name…  ✕]  [Scan]  [Treemap|Tree]
```

- The name filter input is compact and secondary-styled so it doesn't compete with the path input.
- The `✕` clear button appears only when there is text in the field.
- The action bar below the toolbar is **removed entirely**.

### Bottom of treemap

The static category color legend becomes an interactive toggle row:

```
Categories:  ■ Directories  ■ Images  ~~■ Video~~  ■ Code  ■ Documents  ■ Archives  ■ Other  [Reset]
```

- Each swatch + label is a clickable toggle.
- Hidden categories show struck-through label and dimmed swatch.
- A `Reset` link appears (right-aligned) when any category is hidden.
- Filters reset when a new scan starts.

---

## Context Menu

Triggered by right-clicking any tile. Right-clicking also selects the tile (dashed outline).

**Structure:**
```
┌─────────────────────────┐
│ node_modules            │  ← name (bold)
│ 4.2 GB · directory      │  ← size + type (muted)
├─────────────────────────┤
│ 📂  Open in Finder      │
│ 🔄  Rescan Directory    │  ← greyed + "dirs only" badge if tile is a file
├─────────────────────────┤
│ 🗑️  Move to Trash       │  ← red text
└─────────────────────────┘
```

- **Header** always shows the name + size + type so the user knows exactly what they right-clicked, even on a small tile.
- **Rescan** is disabled (greyed, "dirs only" badge) when the tile is a file.
- **Move to Trash** shows a confirmation dialog before invoking the Rust `move_to_trash` command (same as current tree view behaviour). After success, the node is removed from the tree and sizes are recalculated.
- Menu dismisses on outside click or Escape.
- Menu is rendered in a portal at the root of the DOM so it is never clipped by the treemap container.

---

## Filter Behaviour

### Name search

- Filters the **current drill-down level** — only tiles visible at the current navigation depth are affected.
- Non-matching tiles are **fully hidden**. d3 re-lays out the remaining tiles to fill the space.
- Clearing the search (✕ or backspace to empty) immediately restores all tiles.
- Search is case-insensitive, matches anywhere in the name.

### Category toggles

- Toggling a category off **removes** all tiles of that category from the current view and triggers a d3 re-layout.
- Both filters stack: category filtering happens first (removes nodes from the dataset), name search filters within the remainder.
- Both reset on a new scan.

---

## Props Wiring (existing gap to fix)

`Treemap.tsx` already declares the full prop interface but `App.tsx` only passes `root`. As part of this work, all props must be wired:

| Prop | Source in App.tsx | Notes |
|---|---|---|
| `root` | `result` | already passed |
| `selectedPath` | `selectedPath` state | wire through |
| `onSelect` | `setSelectedPath` | wire through |
| `searchQuery` | new `treemapSearchQuery` state | separate from tree view's `searchQuery` |
| `drillRequest` | existing state | wire through |
| `onDrillRequestHandled` | existing handler | wire through |

The name filter state for the treemap is kept separate from the tree view's `searchQuery` so the two views don't share filter state.

---

## New Components

### `ContextMenu.tsx`

A small, self-contained component rendered in a React portal. Props:

```ts
interface ContextMenuProps {
  x: number;
  y: number;
  node: FileNode;
  onOpenInFinder: () => void;
  onRescan: () => void;       // disabled if !node.is_dir
  onMoveToTrash: () => void;
  onClose: () => void;
}
```

Placed at the `App` level so it can invoke the same handlers (`handleOpenInExplorer`, `handleRescan`, `handleMoveToTrash`) that currently back the tree view's action bar.

---

## What Does Not Change

- Double-click to drill into a directory.
- Breadcrumb navigation.
- Single-click to select (dashed outline).
- The tree view and its action bar — unchanged.
- All Rust backend commands — no new Tauri commands needed.
- The `FileNode` type — no changes.
- `scanner.rs` — no changes.

---

## Verification

1. **Right-click menu appears** on any treemap tile at the cursor position.
2. **Open in Finder** reveals the correct path in macOS Finder.
3. **Rescan** on a directory rescans that subtree and updates the treemap in place.
4. **Move to Trash** shows confirmation, deletes, and removes the tile from the treemap with recalculated parent sizes.
5. **Rescan is disabled** on file tiles.
6. **Name search** hides non-matching tiles and the treemap reflows. Clearing restores all tiles.
7. **Category toggle** hides the category's tiles, the swatch is struck-through, and the treemap reflows. Reset restores all.
8. **Both filters together** stack correctly.
9. **Tree view** is unaffected — its action bar and search still work as before.
10. **Context menu closes** on outside click and Escape.
