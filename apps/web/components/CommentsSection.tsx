"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchJson } from "../lib/api";
import { setPendingAction } from "../lib/pendingAction";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";
import { useToast } from "./ToastProvider";
import { LoginPromptDialog } from "./LoginPromptDialog";

type Comment = {
  id: string;
  body: string;
  displayName: string | null;
  createdAt: string;
};

type Props = {
  eventId: string;
  seriesName?: string;
  /** ISO date string of the single event's end time; null/undefined for recurring */
  singleEndAt?: string | null;
  /** "single" or "recurring" */
  scheduleKind?: "single" | "recurring";
};

const MAX_CHARS = 500;

/** Returns true if the event is a past single event older than 30 days. */
function isPastCutoff(scheduleKind?: "single" | "recurring", singleEndAt?: string | null): boolean {
  if (scheduleKind !== "single" || !singleEndAt) return false;
  const endMs = new Date(singleEndAt).getTime();
  const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return endMs < cutoffMs;
}

export function CommentsSection({ eventId, seriesName, singleEndAt, scheduleKind }: Props) {
  const { t } = useI18n();
  const auth = useKeycloakAuth();
  const toast = useToast();

  const readOnly = isPastCutoff(scheduleKind, singleEndAt);

  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  // Restore draft after mount. Reads with side effects must not happen in a
  // useState initializer — React 18 may invoke initializers for renders that
  // are later discarded, which would clear the draft without populating state.
  useEffect(() => {
    try {
      const key = `dr-comment-draft-${eventId}`;
      const draft = sessionStorage.getItem(key);
      if (draft) {
        sessionStorage.removeItem(key);
        setBody(draft);
      }
    } catch { /* ignore */ }
  }, [eventId]);

  // Fetch approved comments
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetchJson<{ items: Comment[]; total: number }>(
          `/events/${eventId}/comments`,
        );
        if (active) {
          setComments(res.items);
          setTotal(res.total);
        }
      } catch {
        // soft fail
      }
    })();
    return () => { active = false; };
  }, [eventId]);

  const handlePost = useCallback(async () => {
    if (!body.trim()) return;
    if (!auth.authenticated) {
      try { sessionStorage.setItem(`dr-comment-draft-${eventId}`, body); } catch { /* ignore */ }
      setShowLogin(true);
      return;
    }
    setPosting(true);
    try {
      const token = await auth.getToken();
      if (!token) return;
      await fetchJson(`/events/${eventId}/comments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: body.trim() }),
      });
      setBody("");
      toast.show(t("comments.toast.posted"), "success");
    } catch {
      toast.show(t("common.actionFailed"), "error");
    } finally {
      setPosting(false);
    }
  }, [auth, body, eventId, toast, t]);

  function handleLogin() {
    setShowLogin(false);
    auth.login();
  }

  function handleRegister() {
    setShowLogin(false);
    auth.register();
  }

  function relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t("comments.justNow");
    if (minutes < 60) return t("comments.minutesAgo", { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("comments.hoursAgo", { count: hours });
    const days = Math.floor(hours / 24);
    return t("comments.daysAgo", { count: days });
  }

  return (
    <div className="comments-section">
      <h3 className="title-m">
        {t("comments.title")}
        {total > 0 && <span className="comments-count"> ({total})</span>}
      </h3>
      {seriesName && (
        <p className="muted comments-series-note">
          {t("comments.seriesNote", { name: seriesName })}
        </p>
      )}

      {/* Post area */}
      {readOnly ? (
        <p className="muted">{t("comments.readOnly")}</p>
      ) : (
        <div className="comments-post">
          <div className="comments-textarea-wrap">
            <textarea
              className="comments-textarea"
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX_CHARS))}
              placeholder={auth.authenticated ? t("comments.placeholder") : t("comments.loginToComment")}
              rows={3}
              maxLength={MAX_CHARS}
            />
            <span className="comments-char-count-inside">
              {body.length}/{MAX_CHARS}
            </span>
          </div>
          <div className="comments-post-footer">
            <button
              className="primary-btn"
              type="button"
              onClick={() => void handlePost()}
              disabled={posting || !body.trim()}
            >
              {posting ? t("comments.posting") : t("comments.post")}
            </button>
          </div>
          {!auth.authenticated && body.length > 0 && (
            <p className="muted">{t("comments.loginHint")}</p>
          )}
        </div>
      )}

      {/* Comment list */}
      {comments.length === 0 ? (
        <p className="muted">{t("comments.empty")}</p>
      ) : (
        <ul className="comments-list">
          {comments.map((c) => (
            <li key={c.id} className="comments-item">
              <div className="comments-item-header">
                <strong>{c.displayName || t("comments.anonymous")}</strong>
                <span className="muted">{relativeTime(c.createdAt)}</span>
              </div>
              <p className="comments-item-body">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      {showLogin && (
        <LoginPromptDialog
          featureKey="comment"
          onLogin={handleLogin}
          onRegister={handleRegister}
          onClose={() => setShowLogin(false)}
        />
      )}
    </div>
  );
}
