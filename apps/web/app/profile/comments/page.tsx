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
        <a href="/events" className="primary-btn" style={{ display: "inline-block", marginTop: 8 }}>
          {t("profile.savedEvents.browseEvents")}
        </a>
      </div>
    );
  }

  const STATUS_LABEL: Record<string, string> = {
    pending: t("profile.comments.statusPending"),
    approved: t("profile.comments.statusApproved"),
    hidden: t("profile.comments.statusRejected"),
    removed: t("profile.comments.statusRejected"),
  };

  function isRejected(status: string): boolean {
    return status === "hidden" || status === "removed";
  }

  function statusClass(status: string): string {
    return isRejected(status) ? "rejected" : status;
  }

  return (
    <ul className="comments-list profile-comments-list">
      {items.map((comment) => (
        <li key={comment.id} className="comments-item">
          <div className="comments-item-info">
            <div className="comments-item-header">
              <a href={`/events/${comment.eventSlug}`}>{comment.eventTitle}</a>
              <span className="muted">
                {new Date(comment.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
              </span>
              <span className={`profile-comment-status profile-comment-status--${statusClass(comment.status)}`}>
                {STATUS_LABEL[comment.status] ?? comment.status}
              </span>
            </div>
            <p className="comments-item-body">{comment.body}</p>
            {isRejected(comment.status) && (
              <p className="meta" style={{ fontSize: "0.8rem", fontStyle: "italic", marginTop: 4 }}>{t("profile.comments.removedByModerator")}</p>
            )}
          </div>
          {!isRejected(comment.status) && (
            <button
              type="button"
              className="secondary-btn profile-comments-delete-btn"
              onClick={() => void remove(comment.eventId, comment.id)}
            >
              {t("profile.comments.delete")}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
