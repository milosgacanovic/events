"use client";

import { useState } from "react";

import { fetchJson } from "../lib/api";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";
import { useToast } from "./ToastProvider";

const REASONS = ["spam", "duplicate", "wrong_info", "removed", "inappropriate", "other"] as const;
const MAX_DETAIL_CHARS = 1000;

type Props = {
  targetType: "event" | "organizer";
  targetId: string;
  onClose: () => void;
  onReported: () => void;
};

export function ReportModal({ targetType, targetId, onClose, onReported }: Props) {
  const { t } = useI18n();
  const auth = useKeycloakAuth();
  const toast = useToast();

  const [reason, setReason] = useState<string>("wrong_info");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const token = await auth.getToken();
      if (!token) return;
      await fetchJson("/reports", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetType,
          targetId,
          reason,
          detail: detail.trim() || undefined,
        }),
      });
      toast.show(t("report.toast.submitted"), "success");
      onReported();
      onClose();
    } catch {
      toast.show(t("common.actionFailed"), "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close">&times;</button>

        <h2 className="modal-title">{t("report.title")}</h2>
        <p className="muted">{t("report.description")}</p>

        <fieldset className="report-reasons">
          {REASONS.map((r) => (
            <label key={r} className="report-reason-option">
              <input
                type="radio"
                name="reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
              />
              {t(`report.reason.${r}`)}
            </label>
          ))}
        </fieldset>

        <div className="modal-field">
          <label className="modal-label">{t("report.detailLabel")}</label>
          <textarea
            className="comments-textarea"
            value={detail}
            onChange={(e) => setDetail(e.target.value.slice(0, MAX_DETAIL_CHARS))}
            rows={3}
            maxLength={MAX_DETAIL_CHARS}
            placeholder={t("report.detailPlaceholder")}
          />
        </div>

        <div className="login-prompt-actions">
          <button className="primary-btn" type="button" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? t("profile.saving") : t("report.submit")}
          </button>
          <button className="secondary-btn" type="button" onClick={onClose}>
            {t("notifyMe.dialog.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
