import { describe, it, expect } from "vitest";
import { detectInsights } from "./insights";
import { FileNode } from "./types";

function makeFile(name: string, size = 100, path = `/root/${name}`): FileNode {
  return { name, path, size, is_dir: false, children: [], file_count: 0 };
}
function makeDir(name: string, children: FileNode[], path = `/root/${name}`): FileNode {
  const size = children.reduce((s, c) => s + c.size, 0);
  return { name, path, size, is_dir: true, children, file_count: children.length };
}

describe("detectInsights", () => {
  it("detects node_modules directories", () => {
    const nm = makeDir("node_modules", [makeFile("index.js", 5_000_000)]);
    const root = makeDir("root", [nm], "/root");
    const insights = detectInsights(root);
    const hit = insights.find(i => i.id === "node_modules");
    expect(hit).toBeDefined();
    expect(hit!.count).toBe(1);
    expect(hit!.totalSize).toBe(5_000_000);
    expect(hit!.navTarget).toBe("overview");
  });

  it("aggregates multiple node_modules", () => {
    const nm1 = makeDir("node_modules", [makeFile("a.js", 1_000_000)], "/p1/node_modules");
    const nm2 = makeDir("node_modules", [makeFile("b.js", 2_000_000)], "/p2/node_modules");
    const root = makeDir("root", [nm1, nm2], "/root");
    const insights = detectInsights(root);
    const hit = insights.find(i => i.id === "node_modules");
    expect(hit!.count).toBe(2);
    expect(hit!.totalSize).toBe(3_000_000);
  });

  it("detects .dmg files with navTarget large-files", () => {
    const dmg = makeFile("Installer.dmg", 2_000_000_000);
    const root = makeDir("root", [dmg], "/root");
    const insights = detectInsights(root);
    const hit = insights.find(i => i.id === "dmg");
    expect(hit).toBeDefined();
    expect(hit!.navTarget).toBe("large-files");
  });

  it("returns empty array when no patterns found", () => {
    const root = makeDir("root", [makeFile("readme.md", 100)], "/root");
    const insights = detectInsights(root);
    expect(insights).toHaveLength(0);
  });

  it("only returns patterns with count > 0", () => {
    const root = makeDir("root", [makeFile("a.ts", 100)], "/root");
    const insights = detectInsights(root);
    expect(insights.every(i => i.count > 0)).toBe(true);
  });
});
