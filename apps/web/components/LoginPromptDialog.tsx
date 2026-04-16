"use client";

import { useEffect } from "react";

import { useI18n } from "./i18n/I18nProvider";

type Props = {
  /** i18n key prefix — resolves to loginPrompt.${featureKey}.title / .description */
  featureKey: string;
  /** Optional entity name interpolated into the title, e.g. host name */
  entityName?: string;
  onLogin: () => void;
  onRegister: () => void;
  onClose: () => void;
};

const FEATURE_ICONS: Record<string, string> = {
  follow: "\uD83D\uDD14",
  save: "\u2764\uFE0F",
  rsvp: "\u2714\uFE0F",
  notifyMe: "\uD83D\uDD14",
  comment: "\uD83D\uDCAC",
  suggestEdit: "\u270F\uFE0F",
  recommend: "\u2709\uFE0F",
  report: "\uD83D\uDEA9",
};

export function LoginPromptDialog({
  featureKey,
  entityName,
  onLogin,
  onRegister,
  onClose,
}: Props) {
  const { t } = useI18n();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const icon = FEATURE_ICONS[featureKey] ?? "";
  const title = t(`loginPrompt.${featureKey}.title`, { name: entityName ?? "" });
  const description = t(`loginPrompt.${featureKey}.description`, { name: entityName ?? "" });

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="login-prompt-title">
        <div className="modal-header">
          <h2 id="login-prompt-title" className="modal-title">
            {icon && <span aria-hidden="true" style={{ marginRight: 8 }}>{icon}</span>}
            {title}
          </h2>
          <button type="button" className="modal-close" aria-label={t("common.close")} onClick={onClose}>
            &times;
          </button>
        </div>

        <p className="modal-description">{description}</p>

        <div className="login-prompt-actions">
          <button type="button" className="primary-btn" onClick={onLogin}>
            {t("loginPrompt.login")}
          </button>
          <button type="button" className="secondary-btn" onClick={onRegister}>
            {t("loginPrompt.register")}
          </button>
        </div>
      </div>
    </div>
  );
}
