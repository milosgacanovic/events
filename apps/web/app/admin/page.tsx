import { AdminConsole } from "../../components/admin/AdminConsole";
import { KeycloakAuthProvider } from "../../components/auth/KeycloakAuthProvider";
import { getKeycloakClientConfig } from "../../lib/keycloakConfig";

export default function AdminPage() {
  const config = getKeycloakClientConfig();

  return (
    <KeycloakAuthProvider config={config}>
      <AdminConsole />
    </KeycloakAuthProvider>
  );
}
