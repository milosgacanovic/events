"use client";

import { useI18n } from "./i18n/I18nProvider";

type Props = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onClose,
}: Props) {
  const { t } = useI18n();

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div className="modal-header">
          <h2 id="confirm-dialog-title" className="modal-title">{title}</h2>
          <button type="button" className="modal-close" aria-label={t("common.close")} onClick={onClose}>
            ×
          </button>
        </div>
        {message && <p className="modal-description">{message}</p>}
        <div className="modal-actions">
          <div className="modal-action-spacer" />
          <button type="button" className="secondary-btn" onClick={onClose}>
            {cancelLabel ?? t("common.cancel")}
          </button>
          <button
            type="button"
            className={danger ? "secondary-btn modal-action-danger" : "primary-btn"}
            onClick={() => { onConfirm(); onClose(); }}
          >
            {confirmLabel ?? t("common.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
