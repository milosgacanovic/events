"use client";

import Link from "next/link";

import { useI18n } from "../i18n/I18nProvider";

export function ManageResultsToolbar({
  createHref,
  createLabel,
  totalItems,
  sortValue,
  sortOptions,
  onSortChange,
  onToggleFilters,
  activeFilterCount,
  filtersOpen,
  view,
  onViewChange,
}: {
  createHref: string;
  createLabel: string;
  totalItems: number;
  sortValue: string;
  sortOptions: Array<{ value: string; label: string }>;
  onSortChange: (v: string) => void;
  onToggleFilters: () => void;
  activeFilterCount: number;
  filtersOpen?: boolean;
  view?: "list" | "map";
  onViewChange?: (v: "list" | "map") => void;
}) {
  const { t } = useI18n();

  return (
    <div className="results-toolbar" style={{ marginBottom: 12 }}>
      <button
        type="button"
        className={`manage-filters-toggle ${activeFilterCount > 0 ? "filters-toggle-btn filters-toggle-btn--active" : filtersOpen ? "filters-toggle-btn filters-toggle-btn--open" : "filters-toggle-btn filters-toggle-btn--default"}`}
        onClick={onToggleFilters}
      >
        {activeFilterCount > 0 ? `${t("manage.filters.title")} (${activeFilterCount})` : t("manage.filters.title")}
      </button>
      <Link href={createHref} className="primary-btn" style={{ whiteSpace: "nowrap" }}>
        {createLabel}
      </Link>
      <span className="meta results-count">
        {t("manage.filters.resultCount", { count: totalItems })}
      </span>
      <div className="results-toolbar-actions">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0 }}>
          <path d="M3 6h18M6 12h12M9 18h6" />
        </svg>
        <select
          value={sortValue}
          onChange={(e) => onSortChange(e.target.value)}
          style={{
            padding: "6px 28px 6px 10px",
            border: "1px solid var(--border, #e0e0e0)",
            borderRadius: 6,
            fontSize: "0.85rem",
            background: "var(--bg, #fff)",
            color: "var(--ink, #333)",
            appearance: "none",
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 10px center",
            backgroundSize: "10px 6px",
          }}
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {onViewChange && (
          <div className="icon-group with-separator">
            <button
              type="button"
              className={view === "list" ? "secondary-btn icon-btn" : "ghost-btn icon-btn"}
              onClick={() => onViewChange("list")}
              aria-label={t("eventSearch.view.list")}
              title={t("eventSearch.view.list")}
            >
              <span aria-hidden className="icon-glyph">☰</span>
              <span className="icon-label">{t("eventSearch.view.list")}</span>
            </button>
            <button
              type="button"
              className={view === "map" ? "secondary-btn icon-btn" : "ghost-btn icon-btn"}
              onClick={() => onViewChange("map")}
              aria-label={t("eventSearch.view.map")}
              title={t("eventSearch.view.map")}
            >
              <span aria-hidden className="icon-glyph">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="10" r="3" />
                  <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" />
                </svg>
              </span>
              <span className="icon-label">{t("eventSearch.view.map")}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
