"use client";

import { ROLE_ADMIN, ROLE_EDITOR } from "@dr-events/shared";

import { useKeycloakAuth } from "../../components/auth/KeycloakAuthProvider";
import { ManageSidebar } from "./ManageSidebar";
import "./manage.css";

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  const auth = useKeycloakAuth();

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
      <ManageSidebar isAdmin={isAdmin} />
      <div className="manage-main">
        {children}
      </div>
    </div>
  );
}
