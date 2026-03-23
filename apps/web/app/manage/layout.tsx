"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

import { ROLE_ADMIN, ROLE_EDITOR } from "@dr-events/shared";

import { useKeycloakAuth } from "../../components/auth/KeycloakAuthProvider";
import { ManageSidebar } from "./ManageSidebar";
import "./manage.css";

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  const auth = useKeycloakAuth();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!auth.ready) {
    return <div className="manage-loading">Loading...</div>;
  }

  if (!auth.authenticated) {
    void auth.login();
    return <div className="manage-loading">Redirecting to login...</div>;
  }

  const isAdmin = auth.roles.includes(ROLE_ADMIN);
  const isEditor = auth.roles.includes(ROLE_EDITOR) || isAdmin;

  if (!isEditor) {
    if (pathname === "/manage/apply") {
      return (
        <div style={{ display: "flex", justifyContent: "center", minHeight: "calc(100vh - 60px)", padding: "24px 16px" }}>
          {children}
        </div>
      );
    }
    return (
      <div className="manage-layout">
        <div className="manage-main">
          <div className="manage-empty">
            <h3>Editor access required</h3>
            <p>You need the editor role to access the manage area.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="manage-layout">
      <button
        type="button"
        className="manage-menu-btn"
        onClick={() => setSidebarOpen((o) => !o)}
        aria-label={sidebarOpen ? "Close menu" : "Open menu"}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      {sidebarOpen && (
        <div className="manage-sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}
      <ManageSidebar isAdmin={isAdmin} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="manage-main">
        {children}
      </div>
    </div>
  );
}
