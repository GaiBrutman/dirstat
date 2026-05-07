import { useState, useRef, useEffect, useMemo } from "react";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { FileNode } from "./types";
import { formatSize, getFileCategory, CATEGORY_COLORS, CATEGORY_LABELS } from "./utils";

function findNodeByPath(root: FileNode, path: string): FileNode | null {
  if (root.path === path) return root;
  for (const child of root.children) {
    const found = findNodeByPath(child, path);
    if (found) return found;
  }
  return null;
}

interface Tile { fileNode: FileNode; x0: number; y0: number; x1: number; y1: number; }

interface TreemapViewProps {
  root: FileNode;
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
  searchQuery: string;
  drillRequest: string | null;
  onDrillRequestHandled: () => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  backRequest?: number;
}

export function TreemapView({ root, selectedPath, onSelect, searchQuery, drillRequest, onDrillRequestHandled, onContextMenu, backRequest = 0 }: TreemapViewProps) {
  const [navPath, setNavPath] = useState<FileNode[]>([root]);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNavPath(prev => {
      if (prev.length === 0 || prev[0].path !== root.path) return [root];
      return prev.map((node, i) => {
        if (i === 0) return root;
        return findNodeByPath(root, node.path) ?? node;
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);
  useEffect(() => { setHiddenCategories(new Set()); }, [root.path]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const currentNode = navPath[navPath.length - 1];

  const filteredChildren = useMemo(() => {
    return currentNode.children
      .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter(c => !hiddenCategories.has(getFileCategory(c)));
  }, [currentNode, searchQuery, hiddenCategories]);

  const tiles = useMemo<Tile[]>(() => {
    if (!size || !filteredChildren.length) return [];

    const syntheticRoot = { _root: true, children: filteredChildren };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h = (hierarchy as any)(syntheticRoot, (d: any) => (d._root ? d.children : null))
      .sum((d: any) => ("size" in d ? (d.size as number) : 0))
      .sort((a: any, b: any) => (b.value ?? 0) - (a.value ?? 0));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (treemap as any)()
      .size([size.width, size.height])
      .paddingInner(2)
      .tile(treemapSquarify)(h);

    return (h.children ?? []).map((c: any) => ({
      fileNode: c.data as FileNode,
      x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1,
    }));
  }, [filteredChildren, size]);

  function drillDown(node: FileNode) {
    if (node.is_dir && node.children.length > 0) {
      setNavPath(p => [...p, node]);
      onSelect(null);
    }
  }
  function navigateTo(idx: number) {
    setNavPath(p => p.slice(0, idx + 1));
    onSelect(null);
  }

  // Handle external drill requests (e.g. "Drill in →" from action bar)
  useEffect(() => {
    if (!drillRequest) return;
    const target = currentNode.children.find(c => c.path === drillRequest);
    if (target) drillDown(target);
    onDrillRequestHandled();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillRequest]);

  // Handle backRequest: navigate up one level
  useEffect(() => {
    if (backRequest === 0) return;
    if (navPath.length > 1) navigateTo(navPath.length - 2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backRequest]);

  // Click timer to distinguish single vs double click
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleTileClick(fileNode: FileNode) {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      // double click — drill in
      drillDown(fileNode);
      return;
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      // single click — select
      onSelect(selectedPath === fileNode.path ? null : fileNode.path);
    }, 220);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1, minHeight: 0 }}>
      <style>{`.tm-crumb:hover { background: var(--surface2) !important; color: var(--text) !important; }`}</style>

      <nav style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "2px", flexShrink: 0 }}>
        {navPath.map((node, i) => {
          const isLast = i === navPath.length - 1;
          return (
            <span key={node.path + i} style={{ display: "flex", alignItems: "center" }}>
              {i > 0 && <span style={{ color: "var(--text3)", margin: "0 4px", userSelect: "none" }}>›</span>}
              <button
                onClick={() => navigateTo(i)}
                className={isLast ? undefined : "tm-crumb"}
                style={{
                  padding: "3px 8px", borderRadius: "6px", border: "none",
                  background: isLast ? "rgba(255,255,255,0.08)" : "transparent",
                  color: isLast ? "var(--text)" : "var(--text3)",
                  fontSize: "13px", fontWeight: isLast ? 600 : 400,
                  cursor: isLast ? "default" : "pointer",
                  transition: "background 120ms, color 120ms",
                }}
              >
                {i === 0 ? (node.name || node.path) : node.name}
              </button>
            </span>
          );
        })}
        {searchQuery && filteredChildren.length === 0 && (
          <span style={{ fontSize: "12px", color: "#6b7280", marginLeft: "8px" }}>
            No items match "{searchQuery}"
          </span>
        )}
        {searchQuery && filteredChildren.length > 0 && (
          <span style={{ fontSize: "12px", color: "#6b7280", marginLeft: "8px" }}>
            {filteredChildren.length} match{filteredChildren.length !== 1 ? "es" : ""}
          </span>
        )}
      </nav>

      <div
        ref={canvasRef}
        style={{
          flex: "1 1 0",
          minHeight: "300px",
          borderRadius: "10px",
          overflow: "hidden",
          background: "var(--bg)",
          border: "1px solid var(--border)",
        }}
      >
        {size && (
          <svg width={size.width} height={size.height} style={{ display: "block" }}>
            <defs>
              <radialGradient id="tile-glow" cx="32%" cy="26%" r="65%">
                <stop offset="0%" stopColor="white" stopOpacity="0.20" />
                <stop offset="50%" stopColor="white" stopOpacity="0.04" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </radialGradient>
            </defs>

            {tiles.map(({ fileNode, x0, y0, x1, y1 }) => {
              const w = x1 - x0;
              const h = y1 - y0;
              const color = CATEGORY_COLORS[getFileCategory(fileNode)];
              const isHovered = hoveredPath === fileNode.path;
              const isSelected = selectedPath === fileNode.path;
              const canDrill = fileNode.is_dir && fileNode.children.length > 0;
              const showName = w > 40 && h > 24;
              const showSize = w > 60 && h > 44;
              const showHint = isHovered && canDrill && w > 80 && h > 60;
              const clipId = `c${fileNode.path.replace(/\W/g, "_")}`;

              return (
                <g
                  key={fileNode.path}
                  onClick={() => handleTileClick(fileNode)}
                  onMouseEnter={() => setHoveredPath(fileNode.path)}
                  onMouseLeave={() => setHoveredPath(null)}
                  onContextMenu={e => {
                    e.preventDefault();
                    onSelect(fileNode.path);
                    onContextMenu(e, fileNode);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <title>{fileNode.name} — {formatSize(fileNode.size)}{canDrill ? "\nDouble-click to open" : ""}</title>
                  <rect x={x0} y={y0} width={w} height={h} fill={color}
                    style={{ filter: isHovered ? "brightness(1.3) saturate(1.15)" : undefined, transition: "filter 80ms" }}
                  />
                  <rect x={x0} y={y0} width={w} height={h} fill="url(#tile-glow)" />
                  <rect x={x0} y={y0} width={w} height={h} fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="1" />

                  {/* Selected ring */}
                  {isSelected && (
                    <rect x={x0 + 1} y={y0 + 1} width={w - 2} height={h - 2}
                      fill="none" stroke="white" strokeWidth="2" strokeDasharray="4 2"
                      style={{ pointerEvents: "none" }}
                    />
                  )}

                  {showName && (
                    <>
                      <clipPath id={clipId}>
                        <rect x={x0 + 1} y={y0 + 1} width={w - 2} height={h - 2} />
                      </clipPath>
                      <text x={x0 + 6} y={y1 - (showSize ? 17 : 6)}
                        clipPath={`url(#${clipId})`}
                        fill="rgba(255,255,255,0.92)" fontSize={11} fontWeight="500"
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        {fileNode.name}
                      </text>
                      {showSize && (
                        <text x={x0 + 6} y={y1 - 5}
                          clipPath={`url(#${clipId})`}
                          fill="rgba(255,255,255,0.5)" fontSize={10}
                          style={{ pointerEvents: "none", userSelect: "none" }}
                        >
                          {formatSize(fileNode.size)}
                        </text>
                      )}
                      {showHint && (
                        <text x={x0 + w - 8} y={y0 + 14}
                          clipPath={`url(#${clipId})`}
                          fill="rgba(255,255,255,0.45)" fontSize={10}
                          textAnchor="end"
                          style={{ pointerEvents: "none", userSelect: "none" }}
                        >
                          double-click to open
                        </text>
                      )}
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", flexShrink: 0, paddingBottom: "2px", alignItems: "center" }}>
        {Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
          const hidden = hiddenCategories.has(cat);
          return (
            <span
              key={cat}
              onClick={() =>
                setHiddenCategories(prev => {
                  const next = new Set(prev);
                  if (next.has(cat)) next.delete(cat); else next.add(cat);
                  return next;
                })
              }
              title={hidden ? "Click to show" : "Click to hide"}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                fontSize: "11px", cursor: "pointer", userSelect: "none",
                color: hidden ? "var(--text3)" : "var(--text2)",
                textDecoration: hidden ? "line-through" : "none",
                transition: "color 120ms",
              }}
            >
              <span style={{
                display: "inline-block", width: "10px", height: "10px",
                borderRadius: "3px", flexShrink: 0,
                backgroundColor: CATEGORY_COLORS[cat],
                opacity: hidden ? 0.25 : 1,
                transition: "opacity 120ms",
              }} />
              {label}
            </span>
          );
        })}
        {hiddenCategories.size > 0 && (
          <span
            onClick={() => setHiddenCategories(new Set())}
            style={{ marginLeft: "auto", fontSize: "11px", color: "var(--accent2)", cursor: "pointer", userSelect: "none" }}
          >
            Reset
          </span>
        )}
      </div>
    </div>
  );
}
