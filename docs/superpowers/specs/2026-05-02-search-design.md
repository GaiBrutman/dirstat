# Search Feature Design — DirStat Phase 7

## Overview

Add a search input to the tree view that filters the scanned `FileNode` tree by name (case-insensitive substring). Non-matching nodes are hidden. Matching nodes are highlighted. Clearing the search restores the full tree.

## Data Flow

1. `App.tsx` holds a new `searchQuery: string` state (empty string = no filter).
2. A derived `displayTree: FileNode | null` is computed inline:
   - When `searchQuery` is empty: `displayTree = result`
   - Otherwise: `displayTree = filterTree(result, searchQuery)` (returns `null` if nothing matches)
3. `displayTree` is passed to `<TreeNode node={displayTree} ...>` — no other prop surface changes.

## `filterTree` Utility

Added to `utils.ts` as a pure recursive function:

```
filterTree(node: FileNode, query: string): FileNode | null
```

- **File node:** return the node if `node.name.toLowerCase().includes(query.toLowerCase())`, else `null`.
- **Directory node:** recursively filter all children; collect survivors. Return the directory with filtered children if the directory's own name matches OR any child survived. Return `null` if nothing survived.
- Result is a tree containing only matching leaves + their ancestor directories. Ancestors naturally have only relevant children, so TreeNode's default `expanded = true` at depth 0 shows all results without any forced-expansion logic.

## Highlighting

`TreeNode` receives an optional `searchQuery?: string` prop. When non-empty, any node whose `name.toLowerCase().includes(searchQuery.toLowerCase())` gets its name rendered with the matching substring wrapped in a `<mark>` tag (amber/yellow background). Non-matching ancestors render their name unstyled (they appear only because they contain matches below them).

The substring match position is found with `indexOf` to split the name into prefix / match / suffix for rendering.

## UI Placement

A search row is rendered in `App.tsx` between the scan bar and the content area. It is visible only when `result` is non-null and the current view is `"tree"`.

Contents:
- Text input: placeholder "Search by name…", controlled by `searchQuery`
- `×` clear button: sets `searchQuery` to `""`
- Match count label: "N items" (count of leaf nodes in `displayTree`) or "No matches" when `filterTree` returns `null`

The treemap view hides the search row entirely (search applies only to tree view).

## Auto-Expand Behavior

No explicit forced-expansion logic is needed. Because `filterTree` prunes the tree, filtered directories have only surviving children. `TreeNode`'s existing default behavior (`expanded = true` at depth 0, `expanded = false` deeper) already reveals all matches. On clear, the original tree is restored and expansion state resets naturally.

## Error / Edge Cases

- `searchQuery` non-empty but `filterTree` returns `null`: render an empty-state message ("No matches for "X"") in place of the tree.
- Single-character queries are valid; no minimum length.
- Search is purely frontend — no Rust involvement.
- Search state resets to `""` when a new scan is initiated.
