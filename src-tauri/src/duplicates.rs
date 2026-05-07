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
        use std::sync::atomic::{AtomicU64, Ordering};
        use std::time::{SystemTime, UNIX_EPOCH};
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().subsec_nanos() as u64;
        let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
        nanos.wrapping_add(seq.wrapping_mul(0x9e37_79b9_7f4a_7c15))
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
