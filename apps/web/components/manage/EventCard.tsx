"use client";

import Link from "next/link";

import { useI18n } from "../i18n/I18nProvider";
import { StatusBadge } from "./StatusBadge";

type EventCardProps = {
  id: string;
  slug: string;
  title: string;
  status: string;
  attendanceMode?: string;
  scheduleKind?: string;
  isImported?: boolean;
  importSource?: string | null;
  detachedFromImport?: boolean;
  coverImagePath?: string | null;
  updatedAt: string;
  practiceCategoryLabel?: string | null;
  eventFormatLabel?: string | null;
  locationCity?: string | null;
  locationCountry?: string | null;
  nextOccurrence?: string | null;
  hostNames?: string | null;
  createdByName?: string | null;
  onPublish?: () => void;
  onUnpublish?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  onAssign?: () => void;
};

export function EventCard({
  id,
  title,
  status,
  isImported,
  importSource,
  detachedFromImport,
  updatedAt,
  practiceCategoryLabel,
  eventFormatLabel,
  locationCity,
  locationCountry,
  nextOccurrence,
  hostNames,
  createdByName,
  onPublish,
  onUnpublish,
  onCancel,
  onDelete,
  onAssign,
}: EventCardProps) {
  const { t } = useI18n();
  return (
    <div className="manage-event-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Link href={`/manage/events/${id}`} className="manage-event-card-title" style={{ textDecoration: "none" }}>
          {title || "(Untitled)"}
        </Link>
        <StatusBadge status={status} />
      </div>
      <div className="manage-event-card-meta">
        {(practiceCategoryLabel || eventFormatLabel) && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
            {practiceCategoryLabel && <span className="tag">{practiceCategoryLabel}</span>}
            {eventFormatLabel && <span className="tag">{eventFormatLabel}</span>}
          </div>
        )}
        {(locationCity || locationCountry) && (
          <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
            {[locationCity, locationCountry].filter(Boolean).join(", ")}
          </div>
        )}
        {nextOccurrence && (
          <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
            Next: {new Date(nextOccurrence).toLocaleDateString()}
          </div>
        )}
        {hostNames && (
          <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
            Hosts: {hostNames}
          </div>
        )}
        <div>
          Updated {new Date(updatedAt).toLocaleDateString()}
          {createdByName && (
            <span style={{ marginLeft: 8, fontSize: "0.8rem", color: "var(--muted)" }}>
              by {createdByName}
            </span>
          )}
          {isImported && !detachedFromImport && (
            <span style={{ marginLeft: 8, fontSize: "0.75rem", padding: "1px 6px", borderRadius: 4, backgroundColor: "var(--warning-bg, #fef3cd)", color: "var(--warning-color, #856404)", border: "1px solid var(--warning-border, #ffc107)" }}>
              ⚠ Imported{importSource ? ` from ${importSource}` : ""}
            </span>
          )}
          {isImported && detachedFromImport && (
            <span style={{ marginLeft: 8, fontSize: "0.75rem", padding: "1px 6px", borderRadius: 4, backgroundColor: "var(--info-bg, #cce5ff)", color: "var(--info-color, #004085)", border: "1px solid var(--info-border, #b8daff)" }}>
              Detached — managed manually
            </span>
          )}
        </div>
      </div>
      <div className="manage-event-card-actions">
        <Link href={`/manage/events/${id}`} className="secondary-btn" style={{ fontSize: "0.85rem" }}>
          Edit
        </Link>
        {status === "draft" && onPublish && (
          <button type="button" className="primary-btn" style={{ fontSize: "0.85rem" }} onClick={onPublish}>
            Publish
          </button>
        )}
        {status === "published" && onUnpublish && (
          <button type="button" className="ghost-btn" style={{ fontSize: "0.85rem" }} onClick={onUnpublish}>
            Unpublish
          </button>
        )}
        {status === "published" && onCancel && (
          <button type="button" className="ghost-btn" style={{ fontSize: "0.85rem", color: "var(--danger, #c53030)" }} onClick={onCancel}>
            Cancel
          </button>
        )}
        {onAssign && (
          <button type="button" className="ghost-btn" style={{ fontSize: "0.85rem" }} onClick={onAssign}>
            Assign
          </button>
        )}
        {onDelete && (
          <button type="button" className="ghost-btn" style={{ fontSize: "0.85rem", color: "var(--danger, #c53030)" }} onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
