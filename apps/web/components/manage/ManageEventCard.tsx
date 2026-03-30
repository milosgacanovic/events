"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { ConfirmDialog } from "./ConfirmDialog";
import { apiBase } from "../../lib/api";
import { formatDateTimeRange } from "../../lib/datetime";
import { getLocalizedRegionLabel } from "../../lib/i18n/icuFallback";

type ManageEventCardProps = {
  id: string;
  slug: string;
  title: string;
  status: string;
  coverImagePath?: string | null;
  attendanceMode?: string;
  isImported?: boolean;
  importSource?: string | null;
  detachedFromImport?: boolean;
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
  coverImagePath,
  attendanceMode,
  isImported,
  importSource,
  detachedFromImport,
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
}: ManageEventCardProps) {
  const { t, locale } = useI18n();
  const [confirmAction, setConfirmAction] = useState<{ action: () => void; title: string; message: string; variant?: "warning" | "danger" | "info" } | null>(null);
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

  return (
    <div className="card event-card-h" style={{ cursor: "default" }}>
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
          {status === "draft" && onPublish && (
            <button type="button" className="manage-card-action-btn manage-btn-publish" onClick={onPublish}>
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
        {statusKey === "draft" ? (
          <DraftChip id={id} kind="events" />
        ) : statusKey === "archived" && onUnarchive ? (
          <ArchivedChip onUnarchive={onUnarchive} confirmKey="manage.eventCard.confirmUnarchive" />
        ) : (
          <span className={`tag manage-status-pill manage-status-pill--${statusKey}`}>{t(`common.status.${statusKey}`)}</span>
        )}
        {!hostNames && status === "draft" && <NoHostChip eventId={id} />}
        {isImported && !detachedFromImport && (
          <span className="tag manage-tag-imported">
            {t("manage.eventCard.importedLabel")}
          </span>
        )}
        {isImported && detachedFromImport && onReattach && (
          <span className="tag manage-tag-detached" onClick={onReattach} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onReattach(); }}>
            <span className="manage-detached-chip-label">{t("manage.eventCard.detachedLabel")}</span>
            <span className="manage-detached-chip-action">{t("manage.eventCard.reattachLabel")}</span>
          </span>
        )}
        {isImported && detachedFromImport && !onReattach && (
          <span className="tag manage-tag-detached">
            {t("manage.eventCard.detachedLabel")}
          </span>
        )}
        {practiceCategoryLabel && <span className="tag tag-practice">{practiceCategoryLabel}</span>}
        {eventFormatKey && <span className="tag">{t(`eventFormat.${eventFormatKey}`)}</span>}
        {tags && tags.length > 0 && tags.map((tag) => (
          <span key={tag} className="tag tag-tag">{t(`tag.${tag.replace(/ /g, "-")}`)}</span>
        ))}
      </div>
      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title ?? ""}
        message={confirmAction?.message ?? ""}
        confirmLabel={t("common.action.ok")}
        cancelLabel={t("manage.common.cancel")}
        variant={confirmAction?.variant}
        onConfirm={() => { confirmAction?.action(); setConfirmAction(null); }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

function DraftChip({ id, kind }: { id: string; kind: "events" | "hosts" }) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href={`/manage/${kind}/${id}`}
      className="tag manage-status-pill manage-status-pill--draft manage-status-chip-interactive"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered ? t("manage.common.edit") : t("common.status.draft")}
    </Link>
  );
}

function ArchivedChip({ onUnarchive, confirmKey }: { onUnarchive: () => void; confirmKey: string }) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  return (
    <>
      <button
        type="button"
        className="tag manage-status-pill manage-status-pill--archived manage-status-chip-interactive"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => setShowConfirm(true)}
      >
        {hovered ? t("manage.eventCard.unarchive") : t("common.status.archived")}
      </button>
      <ConfirmDialog
        open={showConfirm}
        title={t("manage.confirm.title")}
        message={t(confirmKey)}
        confirmLabel={t("common.action.ok")}
        cancelLabel={t("manage.common.cancel")}
        onConfirm={() => { setShowConfirm(false); onUnarchive(); }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}

function NoHostChip({ eventId }: { eventId: string }) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href={`/manage/events/${eventId}#hosts`}
      className="tag manage-no-host-chip"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered ? t("manage.eventCard.addHost") : t("manage.eventCard.noHost")}
    </Link>
  );
}
