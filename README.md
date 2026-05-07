# DirStat

A fast, native disk-usage visualizer built with [Tauri v2](https://tauri.app/), Rust, and React.

Point it at any directory and instantly see where your disk space went — as an interactive treemap or a collapsible file tree.

---

## Features

- **Squarified treemap** — proportional tiles sized by disk usage, powered by `d3-hierarchy`
- **Tree view** — collapsible file/folder hierarchy with size bars
- **File types** — breakdown of space by extension
- **Large files** — flat list of the biggest files in the scanned tree
- **Duplicates** — groups of files sharing the same content hash
- **Inspector** — click any node for detailed metadata
- **Insights strip** — auto-detected callouts (e.g. unusually large dirs, hidden space hogs)
- **Incremental scan progress** — live file count while the Rust backend walks the tree
- **Cancel mid-scan** — stop a long scan at any time
- **Light / dark theme**

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 |
| Backend | Rust (`rayon` for parallel directory traversal) |
| Frontend | React 19 + TypeScript |
| Bundler | Vite 7 |
| Styling | Tailwind CSS v4 |
| Treemap layout | d3-hierarchy (squarify) |

---

## Prerequisites

- [Rust](https://rustup.rs/) (stable toolchain)
- [Node.js](https://nodejs.org/) ≥ 18
- Tauri v2 system dependencies — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

---

## Development

```bash
# Install JS dependencies
npm install

# Start dev server with hot reload (opens the native window)
npm run tauri dev
```

TypeScript type-check without emitting:

```bash
npx tsc --noEmit
```

Rust unit tests:

```bash
cd src-tauri && cargo test
```

---

## Production build

```bash
npm run tauri build
```

Produces a platform-native installer in `src-tauri/target/release/bundle/`.

---

## How it works

1. User enters a path and clicks **Scan**.
2. The React frontend calls `invoke("scan", { path })` via the Tauri IPC bridge.
3. The Rust command validates the path and kicks off `scanner::scan_directory`.
4. Top-level children are walked **in parallel** with `rayon`; each subtree recurses synchronously.
5. `FileNode.size` on directories is the **pre-aggregated** sum of all descendant file sizes — the frontend never re-sums children.
6. The serialized tree is handed back to React, which renders the selected view.

Symlinks are skipped to avoid cycles.

---

## Project structure

```
dirstat/
├── src/                  # React + TypeScript frontend
│   ├── App.tsx           # Root component, scan orchestration
│   ├── Treemap.tsx       # Squarified treemap (d3-hierarchy)
│   ├── TreeNode.tsx      # Recursive collapsible tree
│   ├── DuplicatesView.tsx
│   ├── FileTypesView.tsx
│   ├── LargeFilesView.tsx
│   ├── Inspector.tsx
│   ├── insights.ts       # Heuristics for the insight strip
│   └── types.ts          # Shared TypeScript types
├── src-tauri/
│   ├── src/
│   │   ├── scanner.rs    # Core filesystem walker
│   │   ├── commands.rs   # Tauri command handlers
│   │   ├── duplicates.rs # Duplicate detection
│   │   └── lib.rs        # Command registration
│   └── tauri.conf.json
└── vite.config.ts
```
