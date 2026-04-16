"use client";

import { useState } from "react";

import { fetchJson } from "../lib/api";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";
import { ModalPortal } from "./ModalPortal";
import { useToast } from "./ToastProvider";

const CATEGORIES = ["name", "datetime", "location", "description", "host", "practice", "other"] as const;
const MAX_CHARS = 500;

type Props = {
  targetType: "event" | "organizer";
  targetId: string;
  targetName: string;
  onClose: () => void;
};

export function SuggestEditModal({ targetType, targetId, targetName, onClose }: Props) {
  const { t } = useI18n();
  const auth = useKeycloakAuth();
  const toast = useToast();

  const [category, setCategory] = useState<string>("other");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      const token = await auth.getToken();
      if (!token) return;
      await fetchJson("/suggestions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ targetType, targetId, category, body: body.trim() }),
      });
      toast.show(t("suggestEdit.toast.submitted"), "success");
      onClose();
    } catch {
      toast.show(t("common.actionFailed"), "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalPortal onClose={onClose}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close">&times;</button>

        <h2 className="modal-title">{t("suggestEdit.title")}</h2>
        <p className="muted">{t("suggestEdit.description", { name: targetName })}</p>

        <div className="modal-field">
          <label className="modal-label">{t("suggestEdit.category")}</label>
          <select className="modal-select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{t(`suggestEdit.category.${cat}`)}</option>
            ))}
          </select>
        </div>

        <div className="modal-field">
          <label className="modal-label">{t("suggestEdit.bodyLabel")}</label>
          <textarea
            className="comments-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX_CHARS))}
            rows={4}
            maxLength={MAX_CHARS}
          />
          <span className="muted comments-char-count">{body.length}/{MAX_CHARS}</span>
        </div>

        <div className="login-prompt-actions">
          <button className="primary-btn" type="button" onClick={() => void handleSubmit()} disabled={submitting || !body.trim()}>
            {submitting ? t("profile.saving") : t("suggestEdit.submit")}
          </button>
          <button className="secondary-btn" type="button" onClick={onClose}>
            {t("notifyMe.dialog.cancel")}
          </button>
        </div>
    </ModalPortal>
  );
}
