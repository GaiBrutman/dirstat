import { describe, it, expect } from "vitest";
import { filterTree, countLeaves, countNodes, collectLargeFiles, computeFileTypes, getFileCategory, computeCategoryBreakdown } from "./utils";
import { FileNode } from "./types";

function makeFile(name: string, size = 100): FileNode {
  return { name, path: `/root/${name}`, size, is_dir: false, children: [], file_count: 0 };
}

function makeDir(name: string, children: FileNode[], size = 0): FileNode {
  return { name, path: `/root/${name}`, size, is_dir: true, children, file_count: children.length };
}

describe("filterTree", () => {
  it("returns a file node when its name matches", () => {
    const node = makeFile("photo.jpg");
    expect(filterTree(node, "photo")).not.toBeNull();
  });

  it("returns null for a file that does not match", () => {
    const node = makeFile("video.mp4");
    expect(filterTree(node, "photo")).toBeNull();
  });

  it("is case-insensitive", () => {
    const node = makeFile("Photo.JPG");
    expect(filterTree(node, "photo")).not.toBeNull();
  });

  it("returns null for a directory with no matching descendants", () => {
    const dir = makeDir("docs", [makeFile("readme.txt"), makeFile("notes.txt")]);
    expect(filterTree(dir, "photo")).toBeNull();
  });

  it("returns directory with only matching children", () => {
    const dir = makeDir("docs", [makeFile("photo.jpg"), makeFile("video.mp4")]);
    const result = filterTree(dir, "photo");
    expect(result).not.toBeNull();
    expect(result!.children).toHaveLength(1);
    expect(result!.children[0].name).toBe("photo.jpg");
  });

  it("includes ancestor directory even if its own name does not match", () => {
    const dir = makeDir("docs", [makeFile("photo.jpg")]);
    const result = filterTree(dir, "photo");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("docs");
  });

  it("returns a directory that matches by name even with no matching children", () => {
    const dir = makeDir("photos", [makeFile("video.mp4")]);
    const result = filterTree(dir, "photo");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("photos");
  });
});

describe("countLeaves", () => {
  it("counts a single file as 1", () => {
    expect(countLeaves(makeFile("a.txt"))).toBe(1);
  });

  it("counts 0 for an empty directory", () => {
    expect(countLeaves(makeDir("dir", []))).toBe(0);
  });

  it("counts all file descendants recursively", () => {
    const dir = makeDir("root", [
      makeFile("a.txt"),
      makeDir("sub", [makeFile("b.txt"), makeFile("c.txt")]),
    ]);
    expect(countLeaves(dir)).toBe(3);
  });
});

describe("countNodes", () => {
  it("counts a single file as 1", () => {
    expect(countNodes(makeFile("a.txt"))).toBe(1);
  });

  it("counts a directory and its children", () => {
    const dir = makeDir("root", [makeFile("a.txt"), makeFile("b.txt")]);
    expect(countNodes(dir)).toBe(3); // root + 2 files
  });
});

describe("getFileCategory", () => {
  it("returns 'image' for jpg", () => {
    expect(getFileCategory(makeFile("photo.jpg"))).toBe("image");
  });
  it("returns 'code' for ts", () => {
    expect(getFileCategory(makeFile("index.ts"))).toBe("code");
  });
  it("returns 'other' for unknown extension", () => {
    expect(getFileCategory(makeFile("mystery.xyzabc"))).toBe("other");
  });
  it("returns 'directory' for a dir", () => {
    expect(getFileCategory(makeDir("src", []))).toBe("directory");
  });
});

describe("collectLargeFiles", () => {
  it("returns files above the threshold sorted by size descending", () => {
    const root = makeDir("root", [
      makeFile("big.dmg", 500_000_000),
      makeFile("tiny.txt", 1000),
      makeFile("medium.zip", 200_000_000),
    ], 701_001_000);
    const result = collectLargeFiles(root, 100_000_000);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("big.dmg");
    expect(result[1].name).toBe("medium.zip");
  });

  it("does not include directories", () => {
    const sub = makeDir("node_modules", [makeFile("pkg.js", 100)], 8_000_000_000);
    const root = makeDir("root", [sub], 8_000_000_000);
    const result = collectLargeFiles(root, 1_000_000);
    expect(result.every(n => !n.is_dir)).toBe(true);
  });

  it("returns empty array when nothing meets threshold", () => {
    const root = makeDir("root", [makeFile("a.txt", 100)], 100);
    expect(collectLargeFiles(root, 1_000_000)).toHaveLength(0);
  });
});

describe("computeFileTypes", () => {
  it("groups files by extension and sums sizes", () => {
    const root = makeDir("root", [
      makeFile("a.ts", 1000),
      makeFile("b.ts", 2000),
      makeFile("c.jpg", 5000),
    ], 8000);
    const stats = computeFileTypes(root);
    const tsEntry = stats.find(s => s.extension === "ts");
    expect(tsEntry).toBeDefined();
    expect(tsEntry!.totalSize).toBe(3000);
    expect(tsEntry!.count).toBe(2);
  });

  it("sorts by totalSize descending", () => {
    const root = makeDir("root", [
      makeFile("a.ts", 100),
      makeFile("big.dmg", 99999),
    ], 100099);
    const stats = computeFileTypes(root);
    expect(stats[0].extension).toBe("dmg");
  });
});

describe("computeCategoryBreakdown", () => {
  it("returns one entry per category that has files", () => {
    const root = makeDir("root", [
      makeFile("a.ts", 1000),
      makeFile("b.jpg", 2000),
    ], 3000);
    const breakdown = computeCategoryBreakdown(root);
    const cats = breakdown.map(b => b.category);
    expect(cats).toContain("code");
    expect(cats).toContain("image");
    expect(breakdown.every(b => b.size > 0)).toBe(true);
  });
});
