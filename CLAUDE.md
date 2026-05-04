# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start dev server (opens the Tauri window with hot reload)
npm run tauri dev

# Run Rust unit tests only
cd src-tauri && cargo test

# TypeScript type-check (no emit)
npx tsc --noEmit

# Production build
npm run tauri build
```

## Architecture

DirStat is a **Tauri v2** desktop app: a Rust backend that walks the filesystem, and a React/TypeScript frontend that visualizes the results.

### Data flow

1. User types a path and clicks Scan.
2. Frontend calls `invoke("scan", { path })` via the Tauri bridge.
3. Rust `commands::scan` validates the path, then calls `scanner::scan_directory`.
4. `scan_directory` walks the tree: top-level children are scanned **in parallel** with `rayon`; each subtree recurses synchronously via `scan_node`.
5. The Rust `FileNode` struct (`scanner.rs`) is serialised to JSON and returned as a TypeScript `FileNode` (`types.ts`).
6. React stores it in state and renders either a **tree list** (`TreeNode.tsx`) or a **squarified treemap** (`Treemap.tsx`).

### Frontend layout

- `App.tsx` — CSS Grid (`grid-template-rows: auto auto 1fr`) so the content cell always has a **definite height**. This is important: treemap sizing depends on `getBoundingClientRect()` working correctly, which requires the canvas div to have a non-zero computed height.
- `Treemap.tsx` — Uses `d3-hierarchy` (`treemap` + `treemapSquarify`) for layout. The canvas div has `minHeight: 300px` as a safety floor. Dimensions are measured with `getBoundingClientRect()` (immediate + one `requestAnimationFrame`) and on `window resize`. The SVG is rendered with explicit pixel `width`/`height`.
- `TreeNode.tsx` — Recursive collapsible tree component.

### Rust backend

- `scanner.rs` — Core scanner + unit tests. `FileNode.size` on directories is the **pre-aggregated sum** of all descendant file sizes (not raw `metadata.len()`).
- `commands.rs` — Single Tauri command `scan(path)` with basic validation.
- `lib.rs` — Registers the command; `main.rs` is the entry point.

### Key invariants

- `FileNode.size` for directories already includes all descendants — do **not** sum children recursively in the frontend.
- The d3 hierarchy uses a **synthetic root** wrapping only the direct children of the current node; the accessor returns `null` for non-root nodes to prevent d3 from recursing into the pre-aggregated tree.
- Symlinks are skipped entirely in `scan_node` to avoid cycles.
