import { useEffect } from "react";
import ReactDOM from "react-dom";
import { FileNode } from "./types";
import { formatSize } from "./utils";

interface ContextMenuProps {
  x: number;
  y: number;
  node: FileNode;
  onOpenInFinder: () => void;
  onRescan: () => void;
  onIgnore: () => void;
  onMoveToTrash: () => void;
  onClose: () => void;
}

export function ContextMenu({ x, y, node, onOpenInFinder, onRescan, onIgnore, onMoveToTrash, onClose }: ContextMenuProps) {
  useEffect(() => {
    const handler = () => onClose();
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const menuWidth = 200;
  const menuHeight = 160;
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 8);

  return ReactDOM.createPortal(
    <div
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: "fixed",
        top: clampedY,
        left: clampedX,
        background: "#1c1c2e",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "10px",
        padding: "4px 0",
        minWidth: menuWidth,
        boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
        zIndex: 9999,
        fontSize: "13px",
        color: "#e4e4e7",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: "4px" }}>
        <div style={{ fontWeight: 600, color: "#fafafa", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {node.name}
        </div>
        <div style={{ color: "#71717a", fontSize: "11px", marginTop: "2px" }}>
          {formatSize(node.size)} · {node.is_dir ? "directory" : "file"}
        </div>
      </div>

      <MenuItem icon="📂" label="Open in Finder" onClick={onOpenInFinder} />
      <MenuItem
        icon="🔄"
        label="Rescan Directory"
        onClick={onRescan}
        disabled={!node.is_dir}
        badge={!node.is_dir ? "dirs only" : undefined}
      />
      <MenuItem icon="🚫" label="Hide from View" onClick={onIgnore} />
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", margin: "4px 0" }} />
      <MenuItem icon="🗑️" label="Move to Trash" onClick={onMoveToTrash} danger />
    </div>,
    document.body
  );
}

function MenuItem({ icon, label, onClick, disabled, badge, danger }: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  badge?: string;
  danger?: boolean;
}) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}
      style={{
        padding: "6px 14px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        cursor: disabled ? "default" : "pointer",
        color: disabled ? "#52525b" : danger ? "#f87171" : "#e4e4e7",
        userSelect: "none",
      }}
    >
      <span style={{ opacity: disabled ? 0.4 : 1, fontSize: "15px" }}>{icon}</span>
      <span>{label}</span>
      {badge && (
        <span style={{
          fontSize: "9px",
          background: "rgba(255,255,255,0.07)",
          padding: "1px 6px",
          borderRadius: "4px",
          marginLeft: "auto",
          color: "#71717a",
        }}>
          {badge}
        </span>
      )}
    </div>
  );
}
