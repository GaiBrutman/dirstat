use rayon::prelude::*;
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

#[derive(Serialize, Debug)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub children: Vec<FileNode>,
    pub file_count: u64,
}

/// Recursively scans a path with recursive parallelization.
/// Parallelizes at depths <= PARALLEL_DEPTH_LIMIT for better CPU utilization.
/// Returns None if the path should be skipped (symlink, error, or cancelled).
fn scan_node<F>(
    entry_path: &Path,
    cancel: &Arc<AtomicBool>,
    counter: &Arc<AtomicU64>,
    on_progress: &F,
    depth: usize,
) -> Option<FileNode>
where
    F: Fn(u64, &str) + Sync,
{
    const PARALLEL_DEPTH_LIMIT: usize = 4; // Parallelize up to 4 levels deep

    if cancel.load(Ordering::Relaxed) {
        return None;
    }

    let metadata = match entry_path.symlink_metadata() {
        Ok(m) => m,
        Err(_) => return None,
    };

    // Skip symlinks to avoid cycles
    if metadata.file_type().is_symlink() {
        return None;
    }

    let name = entry_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| entry_path.to_string_lossy().into_owned());

    let path_str = entry_path.to_string_lossy().into_owned();

    if metadata.is_file() {
        let count = counter.fetch_add(1, Ordering::Relaxed) + 1;
        if count % 100 == 0 {
            on_progress(count, &path_str);
        }
        return Some(FileNode {
            name,
            path: path_str,
            size: metadata.len(),
            is_dir: false,
            children: Vec::new(),
            file_count: 0,
        });
    }

    if metadata.is_dir() {
        // Read directory entries using fs::read_dir for better performance
        let entries: Vec<_> = match fs::read_dir(entry_path) {
            Ok(dir) => dir
                .filter_map(|e| e.ok().map(|entry| entry.path()))
                .collect(),
            Err(_) => return None,
        };

        let children: Vec<FileNode> =
            if depth < PARALLEL_DEPTH_LIMIT {
                // Use parallel iteration for shallow depths with sufficient entries
                entries
                    .into_par_iter()
                    .filter_map(|p| scan_node(&p, cancel, counter, on_progress, depth + 1))
                    .collect()
            } else {
                // Use sequential iteration for deep depths or small directories
                entries
                    .into_iter()
                    .filter_map(|p| scan_node(&p, cancel, counter, on_progress, depth + 1))
                    .collect()
            };

        // Early exit if cancelled during traversal
        if cancel.load(Ordering::Relaxed) {
            return None;
        }

        let mut sorted_children = children;
        sorted_children.sort_unstable_by(|a, b| b.size.cmp(&a.size));

        let size: u64 = sorted_children.iter().map(|c| c.size).sum();
        let file_count: u64 = sorted_children
            .iter()
            .map(|c| if c.is_dir { c.file_count } else { 1 })
            .sum();

        let count = counter.fetch_add(1, Ordering::Relaxed) + 1;
        if count % 100 == 0 {
            on_progress(count, &path_str);
        }

        return Some(FileNode {
            name,
            path: path_str,
            size,
            is_dir: true,
            children: sorted_children,
            file_count,
        });
    }

    None
}

/// Scans a directory with full recursive parallelization.
/// Returns Err("cancelled") if the cancel flag is set before or during the scan.
pub fn scan_directory<F>(
    path: &str,
    cancel: &Arc<AtomicBool>,
    counter: &Arc<AtomicU64>,
    on_progress: &F,
) -> Result<FileNode, String>
where
    F: Fn(u64, &str) + Sync,
{
    if cancel.load(Ordering::Relaxed) {
        return Err("cancelled".to_string());
    }

    let root_path = Path::new(path);

    let metadata = match root_path.symlink_metadata() {
        Ok(m) => m,
        Err(_) => {
            return Ok(FileNode {
                name: path.to_string(),
                path: path.to_string(),
                size: 0,
                is_dir: true,
                children: Vec::new(),
                file_count: 0,
            });
        }
    };

    let name = root_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string());

    if !metadata.is_dir() {
        return Ok(FileNode {
            name,
            path: path.to_string(),
            size: metadata.len(),
            is_dir: false,
            children: Vec::new(),
            file_count: 0,
        });
    }

    // Read directory entries directly for better performance
    let entries: Vec<_> = match fs::read_dir(root_path) {
        Ok(dir) => dir
            .filter_map(|e| e.ok().map(|entry| entry.path()))
            .collect(),
        Err(_) => {
            return Ok(FileNode {
                name,
                path: path.to_string(),
                size: 0,
                is_dir: true,
                children: Vec::new(),
                file_count: 0,
            });
        }
    };

    // Parallelize the top level
    let children: Vec<FileNode> = entries
        .into_par_iter()
        .filter_map(|p| scan_node(&p, cancel, counter, on_progress, 1))
        .collect();

    if cancel.load(Ordering::Relaxed) {
        return Err("cancelled".to_string());
    }

    let mut sorted_children = children;
    sorted_children.sort_unstable_by(|a, b| b.size.cmp(&a.size));

    let size: u64 = sorted_children.iter().map(|c| c.size).sum();
    let file_count: u64 = sorted_children
        .iter()
        .map(|c| if c.is_dir { c.file_count } else { 1 })
        .sum();

    Ok(FileNode {
        name,
        path: path.to_string(),
        size,
        is_dir: true,
        children: sorted_children,
        file_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, File};
    use std::io::Write;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_test_dir() -> std::path::PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let seq = COUNTER.fetch_add(1, Ordering::SeqCst);
        let tid = std::thread::current().id();
        let dir = std::env::temp_dir().join(format!("dirstat_test_{}_{}_{:?}", ts, seq, tid));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_file(path: &std::path::Path, size: usize) {
        let mut f = File::create(path).unwrap();
        f.write_all(&vec![0u8; size]).unwrap();
    }

    fn no_cancel() -> Arc<AtomicBool> {
        Arc::new(AtomicBool::new(false))
    }
    fn zero_counter() -> Arc<AtomicU64> {
        Arc::new(AtomicU64::new(0))
    }

    #[test]
    fn test_size_accumulation() {
        let root = unique_test_dir();

        write_file(&root.join("a.bin"), 100);
        write_file(&root.join("b.bin"), 200);
        write_file(&root.join("c.bin"), 300);

        let node = scan_directory(
            root.to_str().unwrap(),
            &no_cancel(),
            &zero_counter(),
            &|_, _| {},
        )
        .unwrap();

        assert_eq!(node.size, 600, "root size should be sum of children");
        assert!(node.is_dir);

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn test_sort_by_size_descending() {
        let root = unique_test_dir();

        write_file(&root.join("small.bin"), 10);
        write_file(&root.join("large.bin"), 500);
        write_file(&root.join("medium.bin"), 250);

        let node = scan_directory(
            root.to_str().unwrap(),
            &no_cancel(),
            &zero_counter(),
            &|_, _| {},
        )
        .unwrap();

        assert_eq!(node.children.len(), 3);
        assert!(
            node.children[0].size >= node.children[1].size,
            "first child should be largest"
        );
        assert!(
            node.children[1].size >= node.children[2].size,
            "children should be sorted descending"
        );

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn test_file_count() {
        let root = unique_test_dir();

        write_file(&root.join("file1.bin"), 50);
        let sub = root.join("sub");
        fs::create_dir(&sub).unwrap();
        write_file(&sub.join("file2.bin"), 50);
        write_file(&sub.join("file3.bin"), 50);

        let node = scan_directory(
            root.to_str().unwrap(),
            &no_cancel(),
            &zero_counter(),
            &|_, _| {},
        )
        .unwrap();

        assert_eq!(node.file_count, 3, "root should report 3 total files");

        let sub_node = node
            .children
            .iter()
            .find(|c| c.is_dir)
            .expect("should have a sub directory");
        assert_eq!(sub_node.file_count, 2, "sub dir should report 2 files");

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn test_nested_size_accumulation() {
        let root = unique_test_dir();

        write_file(&root.join("top_file.bin"), 100);
        let nested = root.join("nested");
        fs::create_dir(&nested).unwrap();
        write_file(&nested.join("nested_file.bin"), 400);

        let node = scan_directory(
            root.to_str().unwrap(),
            &no_cancel(),
            &zero_counter(),
            &|_, _| {},
        )
        .unwrap();

        assert_eq!(node.size, 500, "root size should include nested file");

        let nested_node = node
            .children
            .iter()
            .find(|c| c.is_dir)
            .expect("should have nested directory");
        assert_eq!(nested_node.size, 400, "nested dir size should be 400");

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn test_nonexistent_path() {
        let cancel = Arc::new(AtomicBool::new(false));
        let counter = Arc::new(AtomicU64::new(0));
        let node = scan_directory(
            "/tmp/dirstat_nonexistent_path_xyz_12345",
            &cancel,
            &counter,
            &|_, _| {},
        )
        .unwrap();
        assert_eq!(node.size, 0);
        assert_eq!(node.children.len(), 0);
    }

    #[test]
    fn test_cancel_before_scan_returns_error() {
        let root = unique_test_dir();
        write_file(&root.join("a.bin"), 100);

        let cancel = Arc::new(AtomicBool::new(true)); // pre-cancelled
        let counter = Arc::new(AtomicU64::new(0));

        let result = scan_directory(root.to_str().unwrap(), &cancel, &counter, &|_, _| {});
        assert!(matches!(result, Err(ref e) if e == "cancelled"));

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn test_progress_callback_fires_for_large_directory() {
        let root = unique_test_dir();
        for i in 0..200 {
            write_file(&root.join(format!("f{:04}.bin", i)), 1);
        }

        let cancel = Arc::new(AtomicBool::new(false));
        let counter = Arc::new(AtomicU64::new(0));
        let fired = Arc::new(AtomicU64::new(0));
        let fired_clone = fired.clone();

        let _ = scan_directory(root.to_str().unwrap(), &cancel, &counter, &|_, _| {
            fired_clone.fetch_add(1, Ordering::Relaxed);
        });

        assert!(
            fired.load(Ordering::Relaxed) >= 1,
            "progress should fire at least once for 200 files"
        );

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn test_traversal_performance() {
        let path = "/Users/user/Projects";

        let cancel = Arc::new(AtomicBool::new(false));
        let counter = Arc::new(AtomicU64::new(0));

        let start = std::time::Instant::now();
        let node = scan_directory(path, &cancel, &counter, &|_, _| {}).unwrap();
        let duration = start.elapsed();

        println!("Scanned {} files in {:?}", node.file_count, duration);
    }
}
