import { AdminConsole } from "../../components/admin/AdminConsole";
import { KeycloakAuthProvider } from "../../components/auth/KeycloakAuthProvider";

export default function AdminPage() {
  return (
    <KeycloakAuthProvider>
      <AdminConsole />
    </KeycloakAuthProvider>
  );
}
