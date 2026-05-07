# DirStat — Project Tasks

Phased implementation plan for the cross-platform disk usage analyzer.

---

## Phase 1: Project Scaffolding

- [x] Bootstrap project with `npm create tauri-app` (React + TypeScript template)
- [x] Configure Tailwind CSS
- [x] Add Rust dependencies to `Cargo.toml`: `walkdir`, `rayon`, `serde`, `serde_json`
- [x] Verify hot-reload dev server starts (`npm run tauri dev`)
- [x] Delete boilerplate placeholder content from the default template

**Test:** `npm run tauri dev` opens a blank window with no errors in console or terminal.

---

## Phase 2: Rust Scanner Engine

- [x] Define a `FileNode` struct (path, size, children, is_dir) with `serde::Serialize`
- [x] Implement `scan_directory(path)` using `walkdir` to walk the tree
- [x] Accumulate sizes bottom-up (children before parents)
- [x] Parallelize traversal at the top level using `rayon`
- [x] Sort children by size descending before returning
- [x] Write unit tests for size accumulation and sorting

**Test:** `cargo test` from `src-tauri/` passes. Manually call the scan function in a `#[test]` against a known directory and assert sizes are correct.

---

## Phase 3: Tauri Commands & Frontend Wiring

- [x] Expose `scan_directory` as a `#[tauri::command]` in `commands.rs`
- [x] Register the command in `main.rs`
- [x] In React, call `invoke("scan_directory", { path })` and log the result
- [x] Add a simple path input + "Scan" button to trigger a scan
- [x] Display raw JSON result in a `<pre>` block to verify the data shape

**Test:** Enter a real folder path, click Scan, and confirm the returned JSON tree matches the actual folder structure and sizes on disk.

---

## Phase 4: Tree View

- [x] Build a recursive `TreeNode` React component that renders name + human-readable size
- [x] Sort children by size descending (enforce in Rust or frontend)
- [x] Make nodes collapsible (expand/collapse on click)
- [x] Highlight selected node
- [x] Show file count alongside size for directories

**Test:** Scan a known directory, expand nodes, and verify sizes and sort order match `du -sh` output for the same paths.

---

## Phase 5: Treemap Visualization

- [x] Choose a treemap library (e.g. `recharts` Treemap or `d3-hierarchy`) or implement squarified treemap
- [x] Render top-level children as colored rectangles sized proportionally
- [x] Color-code by file extension category (images, video, code, etc.)
- [x] Clicking a rectangle drills down into that directory
- [x] Breadcrumb bar shows current drill-down path with back navigation

**Test:** Visual check that rectangle areas are proportional to sizes. Drill into a subdirectory and confirm the breadcrumb and displayed nodes update correctly.

---

## Phase 6: Scan UX (Progress & Cancel)

- [x] Emit Tauri events from Rust as directories are scanned (`tauri::Window::emit`)
- [x] Show a progress indicator in the UI (scanned item count or path currently being scanned)
- [x] Add a Cancel button that sets an `AtomicBool` flag checked during traversal
- [x] Disable Scan button while a scan is in progress
- [x] Handle scan errors (permission denied, broken symlinks) gracefully without crashing

**Test:** Scan a large directory (e.g. home folder), observe progress updates, click Cancel, and confirm traversal stops and the UI returns to an idle state.

---

## Phase 7: Search

- [x] Add a search input that filters the scanned tree by name (case-insensitive substring)
- [x] Highlight matching nodes; auto-expand ancestors of matches
- [x] Clear search restores full tree

**Test:** Search for a known filename in a scanned directory and confirm it appears. Verify that clearing the search restores all nodes.

---

## Phase 8: File Operations

- [x] **Open in Explorer:** call a Tauri command that runs `open` (macOS), `explorer` (Windows), or `xdg-open` (Linux) on the selected path
- [x] **Move to Trash:** use the `trash` Rust crate to move files/folders to the system trash
- [x] After deletion, remove the node from the React tree and update ancestor sizes
- [x] **Rescan:** re-invoke the scan on the currently selected directory and merge/replace results
- [x] Confirm dialog before delete

**Test:** Select a test file, move it to trash, confirm it disappears from the UI and the parent size decreases. Verify it appears in system Trash. Test "Open in Explorer" opens the correct folder.

---

## Phase 9: Polish & Distribution

- [x] App icon for all platforms
- [x] Window title updates to show scanned path
- [x] Empty-state UI when no scan has been run
- [x] Error state UI for unreadable paths
- [x] Keyboard shortcuts (Enter to scan, Escape to cancel/clear search)
- [x] Production build and smoke test on all target platforms: `npm run tauri build`

**Test:** Run the production build on macOS, Windows, and Linux (or CI matrix). Perform a full scan → navigate tree → search → delete → rescan flow end-to-end.

---

## Stretch Features (Post-MVP)

- [ ] Duplicate file finder (hash-based)
- [ ] Large file finder (flat list of files above a threshold)
- [ ] File type analytics (breakdown by extension)
- [ ] Live filesystem updates via `notify` crate
- [ ] UI themes (dark / light)
