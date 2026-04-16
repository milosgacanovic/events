"use client";

import { useCallback, useEffect, useState } from "react";

import { useKeycloakAuth } from "../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../components/i18n/I18nProvider";
import { apiBase } from "../../../lib/api";

type UserCommentItem = {
  id: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  body: string;
  status: string;
  createdAt: string;
};

export default function CommentsTab() {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();
  const [items, setItems] = useState<UserCommentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${apiBase}/profile/comments`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { items: UserCommentItem[] };
        setItems(data.items);
      }
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  async function remove(eventId: string, commentId: string) {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${apiBase}/events/${eventId}/comments/${commentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setItems((cur) => cur.filter((i) => i.id !== commentId));
  }

  if (loading) return <p className="muted">{t("profile.loading")}</p>;

  if (items.length === 0) {
    return (
      <div className="manage-empty">
        <p className="muted">{t("profile.comments.empty")}</p>
        <a href="/events" className="secondary-btn" style={{ display: "inline-block", marginTop: 8 }}>
          {t("profile.savedEvents.browseEvents")}
        </a>
      </div>
    );
  }

  return (
    <ul className="comments-list">
      {items.map((comment) => (
        <li key={comment.id} className="comments-item">
          <div className="comments-item-header">
            <a href={`/events/${comment.eventSlug}`}>{comment.eventTitle}</a>
            <span className="muted">
              {new Date(comment.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            </span>
            <span className={`profile-comment-status profile-comment-status--${comment.status}`}>
              {comment.status}
            </span>
          </div>
          <p className="comments-item-body">{comment.body}</p>
          {comment.status === "removed" ? (
            <p className="meta" style={{ fontSize: "0.8rem", fontStyle: "italic" }}>{t("profile.comments.removedByModerator")}</p>
          ) : (
            <button type="button" className="report-btn" onClick={() => void remove(comment.eventId, comment.id)}>
              {t("profile.comments.delete")}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
