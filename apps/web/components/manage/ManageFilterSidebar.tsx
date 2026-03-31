"use client";

import { useEffect } from "react";

import { useI18n } from "../i18n/I18nProvider";

export function ManageFilterSidebar({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();

  // Lock body scroll on mobile when sidebar is open
  useEffect(() => {
    if (!open) return;
    const isMobile = window.innerWidth <= 900;
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      {open && <div className="filters-overlay" onClick={onClose} />}
      <aside className={`panel filters${open ? "" : ""}`}>
        {children}
        <div className="filters-mobile-footer">
          <button type="button" className="primary-btn" onClick={onClose}>
            {t("manage.filters.apply")}
          </button>
        </div>
      </aside>
    </>
  );
}
