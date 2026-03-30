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
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div className="confirm-dialog-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="confirm-dialog-title">{title}</h3>
        <p className="confirm-dialog-message">{message}</p>
        {showDontShowAgain && (
          <label className="confirm-dialog-checkbox">
            <input
              type="checkbox"
              checked={dontShowAgainChecked ?? false}
              onChange={(e) => onDontShowAgainChange?.(e.target.checked)}
            />
            {t("manage.confirm.dontShowAgain")}
          </label>
        )}
        <div className="confirm-dialog-buttons">
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
