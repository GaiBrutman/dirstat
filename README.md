# DirStat

A fast, cross-platform desktop app for visualizing disk usage and finding duplicate files. Built with [Tauri 2](https://tauri.app/) and Rust.

## Features

- **Directory scanning** — recursively maps any folder into a size-sorted file tree
- **Parallel traversal** — uses [Rayon](https://github.com/rayon-rs/rayon) to parallelize at the top levels of the tree for fast scans on multi-core systems
- **Live progress** — emits real-time scan progress events to the frontend
- **Cancellable scans** — cancel any in-progress scan immediately via an atomic flag
- **Duplicate detection** — finds exact duplicate files using SHA-256 hashing with a two-pass approach (group by size first, then hash only candidates)
- **Reclaimable space reporting** — groups duplicates by hash and reports total wasted bytes per group, sorted by most reclaimable space
- **Move to trash** — safely removes files via the OS trash rather than permanent deletion
- **Reveal in explorer** — opens any file or folder in the system file manager

## Architecture

```
src/
├── main.rs          # Binary entry point
├── lib.rs           # Tauri app setup, command registration
├── commands.rs      # Tauri IPC command handlers (scan, cancel, trash, open, find_duplicates)
├── scanner.rs       # Recursive parallel directory scanner
├── duplicates.rs    # SHA-256 duplicate detection engine
└── scan_state.rs    # Shared atomic state (cancel flag, progress counter)
```

The backend exposes five Tauri commands to the frontend:

| Command | Description |
|---|---|
| `scan` | Scan a directory; streams `scan_progress` events during traversal |
| `cancel_scan` | Set the cancellation flag to abort an in-progress scan |
| `find_duplicates` | Scan a path for duplicate files using SHA-256 hashing |
| `move_to_trash` | Move a file or folder to the OS trash |
| `open_in_explorer` | Reveal a path in the system file manager |

## Performance

The scanner parallelizes directory reads up to 4 levels deep using Rayon's parallel iterators. Beyond that depth it falls back to sequential iteration to avoid thread pool saturation on deep trees. Results at every level are sorted largest-first before being returned, so the frontend can immediately display the biggest consumers at the top.

Duplicate detection uses a two-pass strategy to minimize I/O:
1. Group all files by byte size — files with unique sizes can't be duplicates
2. Hash only the candidate groups with `SHA-256` using a 64 KB read buffer

## Requirements

- [Rust](https://rustup.rs/) 1.70+
- [Tauri CLI v2](https://tauri.app/start/prerequisites/)
- Node.js + a frontend dev server running at `http://localhost:1420` (configured in `tauri.conf.json`)

## Development

```bash
# Install Tauri CLI
cargo install tauri-cli --version "^2"

# Run in development mode (starts frontend dev server + Tauri window)
cargo tauri dev

# Build a production bundle for the current platform
cargo tauri build
```

## Testing

The scanner and duplicate-detection modules have unit test coverage. Run them with:

```bash
cargo test
```

Tests cover size accumulation, sort order, file count propagation, cancellation, progress callbacks, duplicate grouping, wasted-space calculation, and edge cases like empty files and symlinks.

## Dependencies

| Crate | Purpose |
|---|---|
| `tauri 2` | Desktop app framework (windowing, IPC, bundling) |
| `tauri-plugin-opener` | Cross-platform file/folder reveal in system explorer |
| `rayon` | Data-parallelism for directory traversal |
| `sha2` | SHA-256 hashing for duplicate detection |
| `trash` | Safe OS-level trash/recycle-bin deletion |
| `serde / serde_json` | JSON serialization for IPC payloads |
