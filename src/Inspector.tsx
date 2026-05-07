// src/Inspector.tsx
import { useState, useEffect } from "react";
import { FileNode, DuplicateGroup } from "./types";
import { FileTypeStats, formatSize, getFileCategory, CATEGORY_COLORS as _ } from "./utils";

export type InspectorTarget =
  | { kind: "file"; node: FileNode; root: FileNode }
  | { kind: "duplicate-group"; group: DuplicateGroup }
  | { kind: "extension"; stats: FileTypeStats; topFiles: FileNode[] }
  | null;

interface InspectorProps {
  target: InspectorTarget;
  onOpenInFinder: (path: string) => void;
  onRescan: (path: string) => void;
  onMoveToTrash: (path: string) => void;
}

const INSIGHT_TEXT: Record<string, string> = {
  node_modules:  "Safe to delete — regenerate with `npm install`.",
  DerivedData:   "Xcode build cache — safe to delete, Xcode will rebuild.",
  __pycache__:   "Python bytecode cache — regenerated automatically.",
  ".dmg":        "Installer image — safe to delete after the app is installed.",
  ".pkg":        "Installer package — safe to delete after installation.",
};

function getInsightText(node: FileNode): string | null {
  if (INSIGHT_TEXT[node.name]) return INSIGHT_TEXT[node.name];
  const ext = "." + (node.name.split(".").pop()?.toLowerCase() ?? "");
  return INSIGHT_TEXT[ext] ?? null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)", marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{value}</div>
    </div>
  );
}

function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500,
        cursor: "pointer", fontFamily: "inherit", width: "100%",
        border: `1px solid ${color}33`, background: `${color}11`, color: color,
        transition: "filter 100ms",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.15)")}
      onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
    >{label}</button>
  );
}

function FileInspector({ node, root, onOpenInFinder, onRescan, onMoveToTrash }: {
  node: FileNode; root: FileNode;
  onOpenInFinder: (p: string) => void;
  onRescan: (p: string) => void;
  onMoveToTrash: (p: string) => void;
}) {
  const [trashArmed, setTrashArmed] = useState(false);

  useEffect(() => {
    setTrashArmed(false);
  }, [node.path]);

  useEffect(() => {
    if (!trashArmed) return;
    const t = setTimeout(() => setTrashArmed(false), 3000);
    return () => clearTimeout(t);
  }, [trashArmed]);

  const percentOfRoot = root.size > 0 ? ((node.size / root.size) * 100).toFixed(1) : "0";
  const insightText = getInsightText(node);
  const category = getFileCategory(node);

  function handleTrash() {
    if (!trashArmed) { setTrashArmed(true); return; }
    setTrashArmed(false);
    onMoveToTrash(node.path);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "12px 16px", overflowY: "auto", flex: 1 }}>
      <Section title="Stats">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <StatCard label="Total size" value={formatSize(node.size)} />
          <StatCard label="% of scan" value={`${percentOfRoot}%`} />
          {node.is_dir && <StatCard label="Files" value={node.file_count.toLocaleString()} />}
          {node.is_dir && (
            <StatCard label="Folders" value={node.children.length.toLocaleString()} />
          )}
          {!node.is_dir && (
            <StatCard label="Type" value={category.charAt(0).toUpperCase() + category.slice(1)} />
          )}
        </div>
      </Section>

      {insightText && (
        <Section title="Insight">
          <div style={{
            background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.18)",
            borderRadius: 8, padding: "10px 12px",
          }}>
            <div style={{ fontSize: 11, color: "#fde68a", lineHeight: 1.5 }}>{insightText}</div>
          </div>
        </Section>
      )}

      <Section title="Actions">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <ActionBtn label="Show in Finder" color="var(--accent2)" onClick={() => onOpenInFinder(node.path)} />
          {node.is_dir && (
            <ActionBtn label="Rescan" color="var(--success)" onClick={() => onRescan(node.path)} />
          )}
          <ActionBtn
            label={trashArmed ? "Confirm? (click again)" : "Move to Trash"}
            color="var(--danger)"
            onClick={handleTrash}
          />
        </div>
      </Section>
    </div>
  );
}

function DuplicateInspector({ group, onMoveToTrash }: {
  group: DuplicateGroup; onMoveToTrash: (p: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "12px 16px", overflowY: "auto", flex: 1 }}>
      <Section title="Duplicate Group">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <StatCard label="Size each" value={formatSize(group.size)} />
          <StatCard label="Reclaimable" value={formatSize(group.total_wasted)} />
          <StatCard label="Copies" value={group.files.length.toString()} />
        </div>
      </Section>
      <Section title="Files">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {group.files.map((f, i) => (
            <div key={f.path} style={{ background: "var(--surface2)", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 11, color: i === 0 ? "var(--success)" : "var(--text2)", marginBottom: 2 }}>
                {i === 0 ? "Newest (kept)" : `Copy ${i + 1}`}
              </div>
              <div style={{ fontSize: 11, color: "var(--text3)", wordBreak: "break-all", lineHeight: 1.4, fontFamily: "'SF Mono','Fira Code',monospace" }}>
                {f.path}
              </div>
              {i > 0 && (
                <button
                  onClick={() => onMoveToTrash(f.path)}
                  style={{
                    marginTop: 6, padding: "4px 10px", borderRadius: 6,
                    border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.1)",
                    color: "var(--danger)", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                  }}
                >Delete this copy</button>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function ExtensionInspector({ stats, topFiles }: { stats: FileTypeStats; topFiles: FileNode[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "12px 16px", overflowY: "auto", flex: 1 }}>
      <Section title="Stats">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <StatCard label="Total size" value={formatSize(stats.totalSize)} />
          <StatCard label="File count" value={stats.count.toLocaleString()} />
          <StatCard label="Category" value={stats.category.charAt(0).toUpperCase() + stats.category.slice(1)} />
        </div>
      </Section>
      <Section title="Largest Files">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {topFiles.map((f) => (
            <div key={f.path} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 8px", background: "var(--surface2)", borderRadius: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.path}>
                {f.path.split("/").slice(-2).join("/")}
              </span>
              <span style={{ fontSize: 11, color: "var(--text3)", flexShrink: 0 }}>{formatSize(f.size)}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

export function Inspector({ target, onOpenInFinder, onRescan, onMoveToTrash }: InspectorProps) {
  const headerName = target == null
    ? null
    : target.kind === "file"
      ? target.node.name
      : target.kind === "duplicate-group"
        ? target.group.files[0]?.path.split("/").pop() ?? "Duplicate"
        : `.${target.stats.extension}`;

  const headerSub = target?.kind === "file" ? target.node.path : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)", marginBottom: 8 }}>
          Inspector
        </div>
        {headerName ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.3, wordBreak: "break-all" }}>
              {headerName}
            </div>
            {headerSub && (
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4, wordBreak: "break-all", lineHeight: 1.4, fontFamily: "'SF Mono','Fira Code',monospace" }}>
                {headerSub}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text3)" }}>Select a file or folder to inspect</div>
        )}
      </div>

      {target?.kind === "file" && (
        <FileInspector node={target.node} root={target.root} onOpenInFinder={onOpenInFinder} onRescan={onRescan} onMoveToTrash={onMoveToTrash} />
      )}
      {target?.kind === "duplicate-group" && (
        <DuplicateInspector group={target.group} onMoveToTrash={onMoveToTrash} />
      )}
      {target?.kind === "extension" && (
        <ExtensionInspector stats={target.stats} topFiles={target.topFiles} />
      )}
    </div>
  );
}
