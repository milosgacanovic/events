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
  onPublish?: () => void;
  onUnpublish?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete?: () => void;
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
  onPublish,
  onUnpublish,
  onArchive,
  onUnarchive,
  onDelete,
}: ManageHostCardProps) {
  const { t, locale } = useI18n();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [chipHover, setChipHover] = useState<string | null>(null);
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
            onMouseEnter={() => setChipHover("status")}
            onMouseLeave={() => setChipHover(null)}
            onClick={() => setConfirmAction({ action: onPublish, title: t("manage.confirm.title"), message: t("manage.hostCard.confirmPublish") })}
          >
            {chipHover === "status" ? t("manage.eventCard.publish") : t("common.status.draft")}
          </button>
        ) : statusKey === "published" && onUnpublish ? (
          <button
            type="button"
            className="tag manage-status-pill manage-status-pill--published manage-status-chip-interactive"
            onMouseEnter={() => setChipHover("status")}
            onMouseLeave={() => setChipHover(null)}
            onClick={() => setConfirmAction({ action: onUnpublish, title: t("manage.confirm.title"), message: t("manage.hostCard.confirmUnpublish"), variant: "warning" })}
          >
            {chipHover === "status" ? t("manage.eventCard.unpublish") : t("common.status.published")}
          </button>
        ) : statusKey === "archived" && onUnarchive ? (
          <button
            type="button"
            className="tag manage-status-pill manage-status-pill--archived manage-status-chip-interactive"
            onMouseEnter={() => setChipHover("status")}
            onMouseLeave={() => setChipHover(null)}
            onClick={() => setConfirmAction({ action: onUnarchive, title: t("manage.confirm.title"), message: t("manage.hostCard.confirmUnarchive"), variant: "warning" })}
          >
            {chipHover === "status" ? t("manage.hostCard.unarchive") : t("common.status.archived")}
          </button>
        ) : (
          <span className={`tag manage-status-pill manage-status-pill--${statusKey}`}>{t(`common.status.${statusKey}`)}</span>
        )}
        {eventCount && eventCount !== "0" && (
          <span className="tag manage-tag-imported">{t("manage.hostCard.events", { count: eventCount })}</span>
        )}
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
