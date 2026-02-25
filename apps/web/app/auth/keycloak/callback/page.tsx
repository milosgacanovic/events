import { KeycloakCallbackClient } from "../../../../components/auth/KeycloakCallbackClient";
import { KeycloakAuthProvider } from "../../../../components/auth/KeycloakAuthProvider";
import { getKeycloakClientConfig } from "../../../../lib/keycloakConfig";

export default function KeycloakCallbackPage() {
  const config = getKeycloakClientConfig();

  return (
    <KeycloakAuthProvider config={config}>
      <KeycloakCallbackClient />
    </KeycloakAuthProvider>
  );
}
