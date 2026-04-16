"use client";

import { useState } from "react";

import { fetchJson } from "../lib/api";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";
import { useToast } from "./ToastProvider";

type Props = {
  eventId: string;
  eventTitle: string;
  onClose: () => void;
};

const MAX_NOTE_CHARS = 500;

export function RecommendModal({ eventId, eventTitle, onClose }: Props) {
  const { t } = useI18n();
  const auth = useKeycloakAuth();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!email.trim()) return;
    setSending(true);
    try {
      const token = await auth.getToken();
      if (!token) return;
      await fetchJson(`/events/${eventId}/recommend`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipientEmail: email.trim(),
          note: note.trim() || undefined,
        }),
      });
      toast.show(t("recommend.toast.sent"), "success");
      onClose();
    } catch {
      toast.show(t("common.actionFailed"), "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close">&times;</button>

        <h2 className="modal-title">{t("recommend.title")}</h2>
        <p className="muted">{t("recommend.description", { name: eventTitle })}</p>

        <div className="modal-field">
          <label className="modal-label">{t("recommend.emailLabel")}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("recommend.emailPlaceholder")}
          />
        </div>

        <div className="modal-field">
          <label className="modal-label">{t("recommend.noteLabel")}</label>
          <textarea
            className="comments-textarea"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_CHARS))}
            rows={3}
            maxLength={MAX_NOTE_CHARS}
            placeholder={t("recommend.notePlaceholder")}
          />
          <span className="muted comments-char-count">{note.length}/{MAX_NOTE_CHARS}</span>
        </div>

        <div className="login-prompt-actions">
          <button className="primary-btn" type="button" onClick={() => void handleSend()} disabled={sending || !email.trim()}>
            {sending ? t("profile.saving") : t("recommend.send")}
          </button>
          <button className="secondary-btn" type="button" onClick={onClose}>
            {t("notifyMe.dialog.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
