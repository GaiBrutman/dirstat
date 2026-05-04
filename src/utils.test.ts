import { describe, it, expect } from "vitest";
import { filterTree, countLeaves, countNodes } from "./utils";
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
