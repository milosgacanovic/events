"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import Keycloak from "keycloak-js";
import type { KeycloakClientConfig } from "../../lib/keycloakConfig";
import { useI18n } from "../i18n/I18nProvider";
import { pushDataLayer } from "../../lib/gtm";

type MessageValues = Record<string, string | number | boolean | null | undefined>;
type Translate = (key: string, values?: MessageValues) => string;

type AuthContextValue = {
  ready: boolean;
  authenticated: boolean;
  token: string | null;
  roles: string[];
  userName: string | null;
  userEmail: string | null;
  authError: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizePath(value: string | undefined, fallback: string): string {
  const candidate = (value ?? "").trim();
  if (!candidate) {
    return fallback;
  }
  return candidate.startsWith("/") ? candidate : `/${candidate}`;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function extractRoles(tokenParsed: unknown, clientId?: string): string[] {
  if (!tokenParsed || typeof tokenParsed !== "object") {
    return [];
  }

  const parsed = tokenParsed as {
    realm_access?: { roles?: string[] };
    resource_access?: Record<string, { roles?: string[] }>;
  };

  const realmRoles = parsed.realm_access?.roles ?? [];
  const resourceRoles = clientId ? parsed.resource_access?.[clientId]?.roles ?? [] : [];

  return Array.from(new Set([...realmRoles, ...resourceRoles]));
}

function describeInitError(error: unknown, t: Translate): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    const payload = error as Record<string, unknown>;
    const code =
      typeof payload.error === "string"
        ? payload.error
        : typeof payload.errorMessage === "string"
          ? payload.errorMessage
          : "";
    const description =
      typeof payload.error_description === "string"
        ? payload.error_description
        : typeof payload.message === "string"
          ? payload.message
          : "";

    if (code || description) {
      return [code, description].filter(Boolean).join(": ");
    }

    try {
      return JSON.stringify(payload);
    } catch {
      return t("auth.error.unknownObject");
    }
  }

  return t("auth.error.unknown");
}

function withKeycloakConfigHint(message: string, t: Translate, clientId?: string): string {
  if (
    message.includes("invalid_client_credentials") ||
    message.includes("invalid_client")
  ) {
    return t("auth.error.invalidClientHint", {
      message,
      clientId: clientId ?? "events",
    });
  }

  return message;
}

function normalizeValue(value: string | undefined): string | undefined {
  const candidate = (value ?? "").trim();
  return candidate || undefined;
}

type KeycloakAuthProviderProps = {
  children: React.ReactNode;
  config?: KeycloakClientConfig;
};

export function KeycloakAuthProvider({ children, config }: KeycloakAuthProviderProps) {
  const { t } = useI18n();
  const keycloakRef = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [userName, setUserName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const keycloakUrl = normalizeValue(config?.url);
  const keycloakRealm = normalizeValue(config?.realm);
  const keycloakClientId = normalizeValue(config?.clientId);
  const loginRedirectPath = normalizePath(
    config?.loginRedirectPath,
    "/auth/keycloak/callback",
  );
  const logoutRedirectPath = normalizePath(
    config?.logoutRedirectPath,
    "/admin",
  );

  useEffect(() => {
    if (!keycloakUrl || !keycloakRealm || !keycloakClientId) {
      setAuthError(t("auth.error.notConfigured"));
      setReady(true);
      return;
    }

    const keycloak = new Keycloak({
      url: keycloakUrl,
      realm: keycloakRealm,
      clientId: keycloakClientId,
    });
    keycloakRef.current = keycloak;

    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    keycloak
      .init({
        onLoad: "check-sso",
        checkLoginIframe: false,
        pkceMethod: "S256",
        silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
      })
      .then(async (isAuthenticated) => {
        setAuthenticated(Boolean(isAuthenticated));
        setToken(keycloak.token ?? null);
        setRoles(extractRoles(keycloak.tokenParsed, keycloakClientId));
        setUserName(
          (
            keycloak.tokenParsed as
              | { preferred_username?: string; name?: string; email?: string }
              | undefined
          )?.preferred_username
            ?? (
              keycloak.tokenParsed as
                | { preferred_username?: string; name?: string; email?: string }
                | undefined
            )?.name
            ?? (
              keycloak.tokenParsed as
                | { preferred_username?: string; name?: string; email?: string }
                | undefined
            )?.email
            ?? null,
        );
        setUserEmail(
          (keycloak.tokenParsed as { email?: string } | undefined)?.email ?? null,
        );

        if (isAuthenticated) {
          await keycloak.loadUserProfile().catch(() => undefined);
        }

        refreshTimer = setInterval(() => {
          keycloak
            .updateToken(60)
            .then((refreshed: boolean) => {
              if (refreshed) {
                const newToken = keycloak.token ?? null;
                const newRoles = extractRoles(keycloak.tokenParsed, keycloakClientId);
                const parsed = keycloak.tokenParsed as
                  | { preferred_username?: string; name?: string; email?: string }
                  | undefined;
                const newUserName = parsed?.preferred_username ?? parsed?.name ?? parsed?.email ?? null;
                const newUserEmail = parsed?.email ?? null;

                setToken((prev) => prev === newToken ? prev : newToken);
                setRoles((prev) => arraysEqual(prev, newRoles) ? prev : newRoles);
                setUserName((prev) => prev === newUserName ? prev : newUserName);
                setUserEmail((prev) => prev === newUserEmail ? prev : newUserEmail);
                setAuthenticated(Boolean(keycloak.authenticated));
              }
            })
            .catch(() => {
              setAuthenticated(false);
              setToken(null);
            });
        }, 20_000);
      })
      .catch((error: unknown) => {
        const message = withKeycloakConfigHint(
          describeInitError(error, t),
          t,
          keycloakClientId,
        );
        setAuthError(
          t("auth.error.initFailed", { message }),
        );
      })
      .finally(() => {
        setReady(true);
      });

    return () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
    };
  }, [keycloakUrl, keycloakRealm, keycloakClientId, t]);

  // Push auth state once after Keycloak initialises
  useEffect(() => {
    if (!ready) return;
    pushDataLayer({ user_authenticated: authenticated });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      authenticated,
      token,
      roles,
      userName,
      userEmail,
      authError,
      login: async () => {
        if (!keycloakRef.current) {
          return;
        }

        try {
          sessionStorage.setItem("auth_return_path", window.location.pathname + window.location.search);
        } catch {}

        await keycloakRef.current.login({
          redirectUri: `${window.location.origin}${loginRedirectPath}`,
        });
      },
      logout: async () => {
        if (!keycloakRef.current) {
          return;
        }

        const protectedPrefixes = ["/manage", "/admin", "/profile"];
        const isProtected = protectedPrefixes.some((p) => window.location.pathname.startsWith(p));
        await keycloakRef.current.logout({
          redirectUri: isProtected ? `${window.location.origin}/` : window.location.href,
        });
      },
      getToken: async () => {
        if (!keycloakRef.current || !keycloakRef.current.authenticated) {
          return null;
        }

        await keycloakRef.current.updateToken(60).catch(() => undefined);
        const currentToken = keycloakRef.current.token ?? null;
        setToken(currentToken);
        return currentToken;
      },
    }),
    [ready, authenticated, token, roles, userName, userEmail, authError, loginRedirectPath, logoutRedirectPath],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useKeycloakAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useKeycloakAuth must be used inside KeycloakAuthProvider");
  }

  return context;
}
