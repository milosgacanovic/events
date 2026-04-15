"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { getRoleLabel } from "../../lib/filterHelpers";
import { apiBase } from "../../lib/api";
import { getLocalizedRegionLabel, getLocalizedLanguageLabel } from "../../lib/i18n/icuFallback";

type ConfirmAction = { action: () => void; title: string; message: string; variant?: "warning" | "danger" | "info" };

type ManageHostCardProps = {
  id: string;
  slug: string;
  name: string;
  status: string;
  imageUrl?: string | null;
  avatarPath?: string | null;
  city?: string | null;
  countryCode?: string | null;
  practiceLabels?: string | null;
  roleLabels?: string | null;
  roleKeys?: string[] | null;
  eventCount?: string | null;
  managedByNames?: string | null;
  languages?: string[] | null;
  /** Admin-only: treat as imported when truthy; hides "created by" chip. */
  isImported?: boolean;
  /** Admin-only: when imported + detached, renders a Detached chip and (if
   *  onReattach is provided) an admin can click to resume importer sync. */
  detachedFromImport?: boolean;
  /** Admin-only: display name of the host creator. When present and the host
   *  isn't imported, a chip is shown that links to the users admin page. */
  createdByName?: string | null;
  onPublish?: () => void;
  onUnpublish?: () => void;
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

export function ManageHostCard({
  id,
  slug,
  name,
  status,
  imageUrl,
  avatarPath,
  city,
  countryCode,
  practiceLabels,
  roleLabels,
  roleKeys,
  eventCount,
  managedByNames,
  languages,
  isImported,
  detachedFromImport,
  createdByName,
  onPublish,
  onUnpublish,
  onArchive,
  onUnarchive,
  onDelete,
  onReattach,
}: ManageHostCardProps) {
  const { t, locale } = useI18n();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const resolvedImage = resolveImageUrl(imageUrl || avatarPath);
  const statusKey = ["published", "draft", "archived"].includes(status) ? status : "draft";
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

  const languageNames = useMemo(() => {
    try { return new Intl.DisplayNames([locale], { type: "language" }); } catch { return null; }
  }, [locale]);

  const regionNames = useMemo(() => {
    try { return new Intl.DisplayNames([locale], { type: "region" }); } catch { return null; }
  }, [locale]);

  const locationParts = [
    city,
    countryCode ? getLocalizedRegionLabel(countryCode, locale, regionNames) : null,
  ].filter(Boolean).join(", ");

  const translatedRoles = roleKeys?.length
    ? roleKeys.map((k) => getRoleLabel(k, t)).join(", ")
    : roleLabels;
  const practiceRole = [practiceLabels, translatedRoles].filter(Boolean).join(" · ");

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
          className="host-card-avatar"
          style={{ background: resolvedImage ? undefined : "var(--surface-skeleton)" }}
        >
          {resolvedImage ? (
            <img src={resolvedImage} alt={name} loading="lazy" decoding="async" />
          ) : (
            <span className="host-card-avatar-initials" aria-hidden>{initials}</span>
          )}
        </div>
        <div className="event-card-body">
          <h3 style={{ margin: "0 0 4px" }}>
            <Link href={`/manage/hosts/${id}`} style={{ textDecoration: "none", color: "inherit" }}>
              {name}
            </Link>
          </h3>
          {locationParts && <div className="meta">{locationParts}</div>}
          {practiceRole && <div className="meta">{practiceRole}</div>}
          {managedByNames && <div className="meta" style={{ fontSize: "0.82rem" }}>{t("manage.common.managedBy", { names: managedByNames })}</div>}
        </div>
        <div className="manage-card-actions">
          <Link href={`/manage/hosts/${id}`} className="manage-card-action-btn secondary-btn">
            {t("manage.common.edit")}
          </Link>
          {status === "draft" && onPublish && (
            <button type="button" className="manage-card-action-btn manage-btn-publish" onClick={() => setConfirmAction({ action: onPublish, title: t("manage.confirm.title"), message: t("manage.hostCard.confirmPublish"), variant: undefined })}>
              {t("manage.eventCard.publish")}
            </button>
          )}
          {status === "published" && onUnpublish && (
            <button type="button" className="manage-card-action-btn manage-btn-unpublish" onClick={() => setConfirmAction({ action: onUnpublish, title: t("manage.confirm.title"), message: t("manage.hostCard.confirmUnpublish"), variant: "warning" })}>
              {t("manage.eventCard.unpublish")}
            </button>
          )}
          {status === "draft" && onArchive && (
            <button type="button" className="manage-card-action-btn manage-btn-cancel" onClick={() => setConfirmAction({ action: onArchive, title: t("manage.confirm.title"), message: t("manage.hostCard.confirmArchive"), variant: "warning" })}>
              {t("manage.eventCard.archive")}
            </button>
          )}
          {onDelete && (
            <button type="button" className="manage-card-action-btn manage-btn-delete" onClick={() => setConfirmAction({ action: onDelete, title: t("manage.confirm.title"), message: t("manage.hostCard.confirmDelete"), variant: "danger" })}>
              {t("manage.eventCard.delete")}
            </button>
          )}
          <Link href={`/hosts/${slug}`} className="manage-card-action-btn manage-btn-view">
            {t("manage.common.view")}
          </Link>
        </div>
      </div>
      <div className="kv event-card-pills">
        {statusKey === "draft" && onPublish ? (
          <button
            type="button"
            className="tag manage-status-pill manage-status-pill--draft manage-status-chip-interactive"
            onClick={() => setConfirmAction({ action: onPublish, title: t("manage.confirm.title"), message: t("manage.hostCard.confirmPublish") })}
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
            onClick={() => setConfirmAction({ action: onUnpublish, title: t("manage.confirm.title"), message: t("manage.hostCard.confirmUnpublish"), variant: "warning" })}
          >
            <span className="chip-label">
              <span className="chip-label-idle">{t("common.status.published")}</span>
              <span className="chip-label-hover">{t("manage.eventCard.unpublish")}</span>
            </span>
          </button>
        ) : statusKey === "archived" && onUnarchive ? (
          <button
            type="button"
            className="tag manage-status-pill manage-status-pill--archived manage-status-chip-interactive"
            onClick={() => setConfirmAction({ action: onUnarchive, title: t("manage.confirm.title"), message: t("manage.hostCard.confirmUnarchive"), variant: "warning" })}
          >
            <span className="chip-label">
              <span className="chip-label-idle">{t("common.status.archived")}</span>
              <span className="chip-label-hover">{t("manage.hostCard.unarchive")}</span>
            </span>
          </button>
        ) : (
          <span className={`tag manage-status-pill manage-status-pill--${statusKey}`}>{t(`common.status.${statusKey}`)}</span>
        )}
        {eventCount && eventCount !== "0" && (
          <span className="tag manage-tag-imported">{t("manage.hostCard.events", { count: eventCount })}</span>
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
        {languages && languages.length > 0 && languages.map((lang) => (
          <span key={lang} className="tag">
            {getLocalizedLanguageLabel(lang, locale, languageNames)}
          </span>
        ))}
      </div>
        </>
      )}
    </div>
  );
}
