"use client";

import { useState } from "react";

import { fetchJson } from "../lib/api";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";
import { ModalPortal } from "./ModalPortal";
import { useToast } from "./ToastProvider";

type Props = {
  filterSnapshot: Record<string, string>;
  filterSummary: string;
  onClose: () => void;
  onSaved: () => void;
};

export function NotifyMeDialog({ filterSnapshot, filterSummary, onClose, onSaved }: Props) {
  const { t } = useI18n();
  const auth = useKeycloakAuth();
  const toast = useToast();

  const [frequency, setFrequency] = useState<"weekly" | "daily">("weekly");
  const [notifyReminders, setNotifyReminders] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const token = await auth.getToken();
      if (!token) return;
      await fetchJson("/profile/saved-searches", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filterSnapshot,
          frequency,
          notifyNew: true,
          notifyReminders,
          notifyUpdates: true,
        }),
      });
      toast.show(t("notifyMe.toast.saved"), "success");
      onSaved();
      onClose();
    } catch {
      toast.show(t("common.actionFailed"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal onClose={onClose}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close">
          &times;
        </button>

        <h2 className="modal-title">{t("notifyMe.dialog.title")}</h2>
        <p className="muted">{t("notifyMe.dialog.description")}</p>

        <div className="notify-me-filters-summary">
          <strong>{t("notifyMe.dialog.filtersLabel")}</strong>
          <span>{filterSummary || t("notifyMe.dialog.allEvents")}</span>
        </div>

        <div className="modal-field">
          <label className="modal-label">{t("notifyMe.dialog.frequency")}</label>
          <select
            className="modal-select"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as "weekly" | "daily")}
          >
            <option value="weekly">{t("notifyMe.dialog.weekly")}</option>
            <option value="daily">{t("notifyMe.dialog.daily")}</option>
          </select>
        </div>

        <label className="toggle-control">
          <input
            className="toggle-control-input"
            type="checkbox"
            checked
            disabled
          />
          <span className="toggle-control-track" aria-hidden />
          <span className="meta">{t("notifyMe.dialog.notifyNew")}</span>
        </label>

        <label className="toggle-control">
          <input
            className="toggle-control-input"
            type="checkbox"
            checked={notifyReminders}
            onChange={(e) => setNotifyReminders(e.target.checked)}
          />
          <span className="toggle-control-track" aria-hidden />
          <span className="meta">{t("notifyMe.dialog.notifyReminders")}</span>
        </label>

        <div className="login-prompt-actions">
          <button className="primary-btn" type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? t("profile.saving") : t("notifyMe.dialog.save")}
          </button>
          <button className="secondary-btn" type="button" onClick={onClose}>
            {t("notifyMe.dialog.cancel")}
          </button>
        </div>
    </ModalPortal>
  );
}
