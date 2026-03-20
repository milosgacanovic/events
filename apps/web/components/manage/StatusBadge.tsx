"use client";

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  published: { bg: "#e6f9e6", color: "#1a7a1a", label: "Published" },
  draft: { bg: "#f0f0f0", color: "#666", label: "Draft" },
  cancelled: { bg: "#fde8e8", color: "#c53030", label: "Cancelled" },
  archived: { bg: "#f0f0f0", color: "#888", label: "Archived" },
  unlisted: { bg: "#fef9e6", color: "#b8860b", label: "Unlisted" },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span
      className="manage-status-badge"
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: "0.8rem",
        fontWeight: 600,
        backgroundColor: style.bg,
        color: style.color,
      }}
    >
      {style.label}
    </span>
  );
}
