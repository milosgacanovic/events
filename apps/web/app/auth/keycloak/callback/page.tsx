import { KeycloakCallbackClient } from "../../../../components/auth/KeycloakCallbackClient";
import { KeycloakAuthProvider } from "../../../../components/auth/KeycloakAuthProvider";

export default function KeycloakCallbackPage() {
  return (
    <KeycloakAuthProvider>
      <KeycloakCallbackClient />
    </KeycloakAuthProvider>
  );
}
