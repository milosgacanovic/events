"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import Keycloak from "keycloak-js";

type AuthContextValue = {
  ready: boolean;
  authenticated: boolean;
  token: string | null;
  roles: string[];
  userName: string | null;
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

export function KeycloakAuthProvider({ children }: { children: React.ReactNode }) {
  const keycloakRef = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [userName, setUserName] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const loginRedirectPath = normalizePath(
    process.env.NEXT_PUBLIC_KEYCLOAK_LOGIN_REDIRECT_PATH,
    "/auth/keycloak/callback",
  );
  const logoutRedirectPath = normalizePath(
    process.env.NEXT_PUBLIC_KEYCLOAK_LOGOUT_REDIRECT_PATH,
    "/admin",
  );

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_KEYCLOAK_URL;
    const realm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM;
    const clientId = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID;

    if (!url || !realm || !clientId || realm === "YOUR_REALM" || clientId === "YOUR_CLIENT_ID") {
      setAuthError("Keycloak is not configured in environment variables.");
      setReady(true);
      return;
    }

    const keycloak = new Keycloak({
      url,
      realm,
      clientId,
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
        setRoles(extractRoles(keycloak.tokenParsed, clientId));
        setUserName(((keycloak.tokenParsed as { preferred_username?: string } | undefined)?.preferred_username ?? null));

        if (isAuthenticated) {
          await keycloak.loadUserProfile().catch(() => undefined);
        }

        refreshTimer = setInterval(() => {
          keycloak
            .updateToken(60)
            .then((refreshed: boolean) => {
              if (refreshed || keycloak.authenticated) {
                setToken(keycloak.token ?? null);
                setRoles(extractRoles(keycloak.tokenParsed, clientId));
                setUserName(
                  ((keycloak.tokenParsed as { preferred_username?: string } | undefined)
                    ?.preferred_username ?? null),
                );
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
        setAuthError(
          error instanceof Error
            ? `Keycloak init failed: ${error.message}`
            : "Keycloak init failed",
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
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      authenticated,
      token,
      roles,
      userName,
      authError,
      login: async () => {
        if (!keycloakRef.current) {
          return;
        }

        await keycloakRef.current.login({
          redirectUri: `${window.location.origin}${loginRedirectPath}`,
        });
      },
      logout: async () => {
        if (!keycloakRef.current) {
          return;
        }

        await keycloakRef.current.logout({
          redirectUri: `${window.location.origin}${logoutRedirectPath}`,
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
    [ready, authenticated, token, roles, userName, authError, loginRedirectPath, logoutRedirectPath],
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
