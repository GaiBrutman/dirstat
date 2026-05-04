import { FileNode } from "./types";

export interface InsightResult {
  id: string;
  icon: string;
  label: string;
  count: number;
  totalSize: number;
  navTarget: "overview" | "large-files";
  filter: string;
}

interface Pattern {
  id: string;
  icon: string;
  label: string;
  navTarget: "overview" | "large-files";
  filter: string;
  matches: (node: FileNode) => boolean;
}

const PATTERNS: Pattern[] = [
  {
    id: "node_modules",
    icon: "⚡",
    label: "node_modules",
    navTarget: "overview",
    filter: "node_modules",
    matches: (n) => n.is_dir && n.name === "node_modules",
  },
  {
    id: "derived_data",
    icon: "🔨",
    label: "Xcode DerivedData",
    navTarget: "overview",
    filter: "DerivedData",
    matches: (n) => n.is_dir && n.name === "DerivedData",
  },
  {
    id: "pycache",
    icon: "🐍",
    label: "__pycache__",
    navTarget: "overview",
    filter: "__pycache__",
    matches: (n) => n.is_dir && n.name === "__pycache__",
  },
  {
    id: "gradle_cache",
    icon: "☕",
    label: "Gradle caches",
    navTarget: "overview",
    filter: "caches",
    matches: (n) => n.is_dir && n.path.includes(".gradle/caches"),
  },
  {
    id: "dmg",
    icon: "📦",
    label: ".dmg installers",
    navTarget: "large-files",
    filter: ".dmg",
    matches: (n) => !n.is_dir && n.name.toLowerCase().endsWith(".dmg"),
  },
  {
    id: "pkg",
    icon: "📦",
    label: ".pkg installers",
    navTarget: "large-files",
    filter: ".pkg",
    matches: (n) => !n.is_dir && n.name.toLowerCase().endsWith(".pkg"),
  },
];

export function detectInsights(root: FileNode): InsightResult[] {
  const accumulators = new Map<string, InsightResult>(
    PATTERNS.map((p) => [
      p.id,
      { id: p.id, icon: p.icon, label: p.label, count: 0, totalSize: 0, navTarget: p.navTarget, filter: p.filter },
    ])
  );

  function walk(node: FileNode) {
    for (const pattern of PATTERNS) {
      if (pattern.matches(node)) {
        const acc = accumulators.get(pattern.id)!;
        acc.count++;
        acc.totalSize += node.size;
      }
    }
    for (const child of node.children) walk(child);
  }
  walk(root);

  return Array.from(accumulators.values()).filter((r) => r.count > 0);
}
