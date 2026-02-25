export type KeycloakClientConfig = {
  url?: string;
  realm?: string;
  clientId?: string;
  loginRedirectPath?: string;
  logoutRedirectPath?: string;
};

const PLACEHOLDER_VALUES = new Set(["YOUR_REALM", "YOUR_CLIENT_ID"]);

function sanitize(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (!candidate || PLACEHOLDER_VALUES.has(candidate)) {
    return undefined;
  }
  return candidate;
}

export function getKeycloakClientConfig(): KeycloakClientConfig {
  return {
    url: sanitize(process.env.NEXT_PUBLIC_KEYCLOAK_URL) ?? "https://sso.danceresource.org",
    realm: sanitize(process.env.NEXT_PUBLIC_KEYCLOAK_REALM) ?? sanitize(process.env.KEYCLOAK_REALM),
    clientId: sanitize(process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID) ?? sanitize(process.env.KEYCLOAK_CLIENT_ID),
    loginRedirectPath: sanitize(process.env.NEXT_PUBLIC_KEYCLOAK_LOGIN_REDIRECT_PATH) ?? "/auth/keycloak/callback",
    logoutRedirectPath: sanitize(process.env.NEXT_PUBLIC_KEYCLOAK_LOGOUT_REDIRECT_PATH) ?? "/admin",
  };
}
