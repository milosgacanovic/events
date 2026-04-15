"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { apiBase } from "../../lib/api";
import { formatDateTimeRange } from "../../lib/datetime";
import { getLocalizedRegionLabel } from "../../lib/i18n/icuFallback";

type ConfirmAction = { action: () => void; title: string; message: string; variant?: "warning" | "danger" | "info" };

type ManageEventCardProps = {
  id: string;
  slug: string;
  title: string;
  status: string;
  visibility?: string;
  coverImagePath?: string | null;
  attendanceMode?: string;
  isImported?: boolean;
  importSource?: string | null;
  detachedFromImport?: boolean;
  /** Admin-only: display name of the event creator. When present and the event
   *  isn't imported, a chip is shown that links to the users admin page. */
  createdByName?: string | null;
  practiceCategoryLabel?: string | null;
  eventFormatLabel?: string | null;
  eventFormatKey?: string | null;
  tags?: string[] | null;
  locationCity?: string | null;
  locationCountry?: string | null;
  nextOccurrence?: string | null;
  nextEndsAt?: string | null;
  eventTimezone?: string | null;
  hostNames?: string | null;
  onPublish?: () => void;
  onUnpublish?: () => void;
  onCancel?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete?: () => void;
  onReattach?: () => void;
  onMakePublic?: () => void;
};

function resolveImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return apiBase.replace("/api", "") + path;
}

export function ManageEventCard({
  id,
  slug,
  title,
  status,
  visibility,
  coverImagePath,
  attendanceMode,
  isImported,
  importSource,
  detachedFromImport,
  createdByName,
  practiceCategoryLabel,
  eventFormatLabel,
  eventFormatKey,
  tags,
  locationCity,
  locationCountry,
  nextOccurrence,
  nextEndsAt,
  eventTimezone,
  hostNames,
  onPublish,
  onUnpublish,
  onCancel,
  onArchive,
  onUnarchive,
  onDelete,
  onReattach,
  onMakePublic,
}: ManageEventCardProps) {
  const { t, locale } = useI18n();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const imageUrl = resolveImageUrl(coverImagePath);
  const statusKey = ["published", "draft", "cancelled", "archived", "unlisted"].includes(status) ? status : "draft";

  const regionNames = useMemo(() => {
    try { return new Intl.DisplayNames([locale], { type: "region" }); } catch { return null; }
  }, [locale]);

  const locationParts = [
    locationCity,
    locationCountry ? getLocalizedRegionLabel(locationCountry, locale, regionNames) : null,
  ].filter(Boolean).join(", ");

  const dateDisplay = nextOccurrence && nextEndsAt
    ? formatDateTimeRange(nextOccurrence, nextEndsAt, eventTimezone ?? "UTC", "event").primary
    : nextOccurrence
      ? new Date(nextOccurrence).toLocaleDateString()
      : null;

  const publishConfirm: ConfirmAction | undefined = onPublish ? {
    action: onPublish,
    title: !hostNames ? t("manage.eventForm.noHostWarningTitle") : t("manage.confirm.title"),
    message: !hostNames ? t("manage.eventForm.noHostWarningMessage") : t("manage.eventCard.confirmPublish"),
    variant: !hostNames ? "warning" : undefined,
  } : undefined;

  return (
    <div className="card event-card-h" style={{ cursor: "default", position: "relative" }}>
      {confirmAction ? (
        <div className="manage-card-confirm">
          <h4 className="manage-card-confirm-title">{confirmAction.title}</h4>
          <p className="manage-card-confirm-message">{confirmAction.message}</p>
          <div className="manage-card-confirm-buttons">
            <button type="button" className="ghost-btn" onClick={() => setConfirmAction(null)}>
              {t("manage.common.cancel")}
            </button>
            <button
              type="button"
              className={confirmAction.variant === "danger" ? "danger-btn" : confirmAction.variant === "warning" ? "warning-btn" : "primary-btn"}
              onClick={() => { confirmAction.action(); setConfirmAction(null); }}
            >
              {t("common.action.ok")}
            </button>
          </div>
        </div>
      ) : (
        <>
      <div className="event-card-main">
        <div
          className="event-card-thumb-h"
          style={{ background: imageUrl ? undefined : "var(--surface-skeleton)" }}
        >
          {imageUrl ? (
            <img className="event-card-thumb" src={imageUrl} alt={title} loading="lazy" decoding="async" />
          ) : (
            <img className="event-card-fallback-logo" src="/logo.jpg" alt="" aria-hidden />
          )}
        </div>
        <div className="event-card-body">
          <h3>
            <Link href={`/manage/events/${id}`} style={{ textDecoration: "none", color: "inherit" }}>
              {title || "(Untitled)"}
            </Link>
          </h3>
          {(dateDisplay || attendanceMode) && (
            <div className="meta">
              {dateDisplay}{dateDisplay && attendanceMode ? " · " : ""}{attendanceMode ? t(`attendanceMode.${attendanceMode}`) : ""}
            </div>
          )}
          {locationParts && <div className="meta">{locationParts}</div>}
          {hostNames && <div className="meta">{hostNames}</div>}
        </div>
        <div className="manage-card-actions">
          <Link href={`/manage/events/${id}`} className="manage-card-action-btn secondary-btn">
            {t("manage.common.edit")}
          </Link>
          {status === "draft" && publishConfirm && (
            <button type="button" className="manage-card-action-btn manage-btn-publish" onClick={() => setConfirmAction(publishConfirm)}>
              {t("manage.eventCard.publish")}
            </button>
          )}
          {status === "published" && onUnpublish && (
            <button type="button" className="manage-card-action-btn manage-btn-unpublish" onClick={() => setConfirmAction({ action: onUnpublish, title: t("manage.confirm.title"), message: t("manage.eventCard.confirmUnpublish"), variant: "warning" })}>
              {t("manage.eventCard.unpublish")}
            </button>
          )}
          {status === "published" && onCancel && (
            <button type="button" className="manage-card-action-btn manage-btn-cancel" onClick={() => setConfirmAction({ action: onCancel, title: t("manage.confirm.title"), message: t("manage.eventCard.confirmCancel"), variant: "warning" })}>
              {t("manage.common.cancel")}
            </button>
          )}
          {onArchive && status !== "archived" && (
            <button type="button" className="manage-card-action-btn manage-btn-cancel" onClick={() => setConfirmAction({ action: onArchive, title: t("manage.confirm.title"), message: t("manage.eventCard.confirmArchive"), variant: "warning" })}>
              {t("manage.eventCard.archive")}
            </button>
          )}
          {onDelete && (
            <button type="button" className="manage-card-action-btn manage-btn-delete" onClick={() => setConfirmAction({ action: onDelete, title: t("manage.confirm.title"), message: t("manage.eventCard.confirmDelete"), variant: "danger" })}>
              {t("manage.eventCard.delete")}
            </button>
          )}
          <Link href={`/events/${slug}`} className="manage-card-action-btn manage-btn-view">
            {t("manage.common.view")}
          </Link>
        </div>
      </div>
      <div className="kv event-card-pills">
        {statusKey === "draft" && publishConfirm ? (
          <button
            type="button"
            className="tag manage-status-pill manage-status-pill--draft manage-status-chip-interactive"
            onClick={() => setConfirmAction(publishConfirm)}
          >
            <span className="chip-label">
              <span className="chip-label-idle">{t("common.status.draft")}</span>
              <span className="chip-label-hover">{t("manage.eventCard.publish")}</span>
            </span>
          </button>
        ) : statusKey === "published" && onUnpublish ? (
          <button
            type="button"
            className="tag manage-status-pill manage-status-pill--published manage-status-chip-interactive"
            onClick={() => setConfirmAction({ action: onUnpublish, title: t("manage.confirm.title"), message: t("manage.eventCard.confirmUnpublish"), variant: "warning" })}
          >
            <span className="chip-label">
              <span className="chip-label-idle">{t("common.status.published")}</span>
              <span className="chip-label-hover">{t("manage.eventCard.unpublish")}</span>
            </span>
          </button>
        ) : statusKey === "cancelled" && onArchive ? (
          <button
            type="button"
            className="tag manage-status-pill manage-status-pill--cancelled manage-status-chip-interactive"
            onClick={() => setConfirmAction({ action: onArchive, title: t("manage.confirm.title"), message: t("manage.eventCard.confirmArchive"), variant: "warning" })}
          >
            <span className="chip-label">
              <span className="chip-label-idle">{t("common.status.cancelled")}</span>
              <span className="chip-label-hover">{t("manage.eventCard.archive")}</span>
            </span>
          </button>
        ) : statusKey === "archived" && onUnarchive ? (
          <button
            type="button"
            className="tag manage-status-pill manage-status-pill--archived manage-status-chip-interactive"
            onClick={() => setConfirmAction({ action: onUnarchive, title: t("manage.confirm.title"), message: t("manage.eventCard.confirmUnarchive"), variant: "warning" })}
          >
            <span className="chip-label">
              <span className="chip-label-idle">{t("common.status.archived")}</span>
              <span className="chip-label-hover">{t("manage.eventCard.unarchive")}</span>
            </span>
          </button>
        ) : (
          <span className={`tag manage-status-pill manage-status-pill--${statusKey}`}>{t(`common.status.${statusKey}`)}</span>
        )}
        {visibility === "unlisted" && onMakePublic ? (
          <button
            type="button"
            className="tag manage-status-pill manage-status-pill--unlisted manage-status-chip-interactive"
            onClick={() => setConfirmAction({ action: onMakePublic, title: t("manage.confirm.title"), message: t("manage.eventCard.confirmMakePublic") })}
          >
            <span className="chip-label">
              <span className="chip-label-idle">{t("common.visibility.unlisted")}</span>
              <span className="chip-label-hover">{t("manage.eventCard.makePublic")}</span>
            </span>
          </button>
        ) : visibility === "unlisted" ? (
          <span className="tag manage-status-pill manage-status-pill--unlisted">{t("common.visibility.unlisted")}</span>
        ) : null}
        {!hostNames && status === "draft" && (
          <Link
            href={`/manage/events/${id}#hosts`}
            className="tag manage-no-host-chip manage-status-chip-interactive"
          >
            <span className="chip-label">
              <span className="chip-label-idle">{t("manage.eventCard.noHost")}</span>
              <span className="chip-label-hover">{t("manage.common.edit")}</span>
            </span>
          </Link>
        )}
        {isImported && !detachedFromImport && (
          <span className="tag manage-tag-imported">
            {t("manage.eventCard.importedLabel")}
          </span>
        )}
        {!isImported && createdByName && (
          <Link
            href={`/manage/admin/users?q=${encodeURIComponent(createdByName)}`}
            className="tag manage-tag-imported"
            title={t("manage.eventCard.createdByTooltip", { name: createdByName })}
          >
            {t("manage.eventCard.createdByLabel", { name: createdByName })}
          </Link>
        )}
        {isImported && detachedFromImport && onReattach ? (
          <button
            type="button"
            className="tag manage-tag-detached manage-status-chip-interactive"
            onClick={() => setConfirmAction({ action: onReattach, title: t("manage.confirm.title"), message: t("manage.eventCard.confirmReattach") })}
          >
            <span className="chip-label">
              <span className="chip-label-idle">{t("manage.eventCard.detachedLabel")}</span>
              <span className="chip-label-hover">{t("manage.eventCard.reattachLabel")}</span>
            </span>
          </button>
        ) : isImported && detachedFromImport ? (
          <span className="tag manage-tag-detached">
            {t("manage.eventCard.detachedLabel")}
          </span>
        ) : null}
        {practiceCategoryLabel && <span className="tag tag-practice">{practiceCategoryLabel}</span>}
        {eventFormatKey && <span className="tag">{t(`eventFormat.${eventFormatKey}`)}</span>}
        {tags && tags.length > 0 && tags.map((tag) => (
          <span key={tag} className="tag tag-tag">{t(`tag.${tag.replace(/ /g, "-")}`)}</span>
        ))}
      </div>
        </>
      )}
    </div>
  );
}
