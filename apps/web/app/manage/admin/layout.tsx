"use client";

import { ROLE_ADMIN } from "@dr-events/shared";

import { useKeycloakAuth } from "../../../components/auth/KeycloakAuthProvider";

export default function AdminManageLayout({ children }: { children: React.ReactNode }) {
  const auth = useKeycloakAuth();
  const isAdmin = auth.roles.includes(ROLE_ADMIN);

  if (!isAdmin) {
    return (
      <div className="manage-empty">
        <h3>Admin access required</h3>
        <p>This section is only available to platform administrators.</p>
      </div>
    );
  }

  return <>{children}</>;
}
