"use client";

import { useI18n } from "../i18n/I18nProvider";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "warning" | "danger" | "info";
  showDontShowAgain?: boolean;
  onDontShowAgainChange?: (checked: boolean) => void;
  dontShowAgainChecked?: boolean;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  variant,
  showDontShowAgain,
  onDontShowAgainChange,
  dontShowAgainChecked,
}: ConfirmDialogProps) {
  const { t } = useI18n();

  if (!open) return null;

  const confirmClass =
    variant === "danger"
      ? "danger-btn"
      : variant === "warning"
        ? "warning-btn"
        : "primary-btn";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--surface, #fff)",
          borderRadius: 12,
          padding: 24,
          maxWidth: 420,
          width: "90%",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 12px", fontSize: "1.1rem" }}>{title}</h3>
        <p style={{ margin: "0 0 20px", color: "var(--ink-muted)", lineHeight: 1.5 }}>{message}</p>
        {showDontShowAgain && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 16px", fontSize: "0.85rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={dontShowAgainChecked ?? false}
              onChange={(e) => onDontShowAgainChange?.(e.target.checked)}
            />
            {t("manage.confirm.dontShowAgain")}
          </label>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {cancelLabel && (
            <button type="button" className="ghost-btn" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button type="button" className={confirmClass} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
