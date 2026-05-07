import { InsightResult } from "./insights";
import { formatSize } from "./utils";

interface InsightStripProps {
  insights: InsightResult[];
  onNavigate: (navTarget: "overview" | "large-files", filter: string) => void;
}

export function InsightStrip({ insights, onNavigate }: InsightStripProps) {
  if (insights.length === 0) return null;

  return (
    <div style={{
      background: "rgba(99,102,241,0.05)",
      borderBottom: "1px solid rgba(99,102,241,0.12)",
      padding: "7px 16px",
      display: "flex", alignItems: "center", gap: 8,
      flexShrink: 0, overflow: "hidden",
    }}>
      <span style={{ fontSize: 11, color: "var(--text3)", flexShrink: 0 }}>Detected:</span>
      <div style={{ display: "flex", gap: 6, overflow: "auto", flex: 1 }}>
        {insights.map((insight) => (
          <button
            key={insight.id}
            onClick={() => onNavigate(insight.navTarget, insight.filter)}
            title={`Click to navigate — ${insight.count} found, ${formatSize(insight.totalSize)} total`}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "var(--surface2)", border: "1px solid var(--border2)",
              borderRadius: 20, padding: "4px 10px",
              fontSize: 11, color: "var(--text2)", cursor: "pointer",
              fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap",
              transition: "border-color 100ms, color 100ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)";
              e.currentTarget.style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border2)";
              e.currentTarget.style.color = "var(--text2)";
            }}
          >
            <span>{insight.icon}</span>
            <span style={{ color: "var(--warning)", fontWeight: 700 }}>{insight.count}</span>
            <span>{insight.label}</span>
            <span style={{ color: "var(--text3)" }}>—</span>
            <span>{formatSize(insight.totalSize)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
