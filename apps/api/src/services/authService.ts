import { ROLE_ADMIN, ROLE_EDITOR, type AuthContext } from "@dr-events/shared";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type AuthConfig = {
  issuer?: string;
  jwksUrl?: string;
  audience?: string;
  clientId?: string;
};

type KeycloakPayload = JWTPayload & {
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
};

export function extractRolesFromPayload(payload: KeycloakPayload, clientId?: string): string[] {
  const realmRoles = payload.realm_access?.roles ?? [];
  const clientRoles = clientId ? payload.resource_access?.[clientId]?.roles ?? [] : [];
  return Array.from(new Set([...realmRoles, ...clientRoles]));
}

export class AuthService {
  private readonly jwks;

  constructor(private readonly config: AuthConfig) {
    this.jwks = this.config.jwksUrl ? createRemoteJWKSet(new URL(this.config.jwksUrl)) : null;
  }

  private extractRoles(payload: KeycloakPayload): string[] {
    return extractRolesFromPayload(payload, this.config.clientId);
  }

  async authenticate(authHeader?: string): Promise<AuthContext> {
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("missing_bearer");
    }

    if (!this.jwks || !this.config.issuer || !this.config.audience) {
      throw new Error("auth_not_configured");
    }

    const token = authHeader.slice("Bearer ".length);
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.config.issuer,
      audience: this.config.audience,
    });

    if (!payload.sub) {
      throw new Error("invalid_subject");
    }

    const roles = this.extractRoles(payload as KeycloakPayload);
    const isAdmin = roles.includes(ROLE_ADMIN);
    const isEditor = isAdmin || roles.includes(ROLE_EDITOR);

    return {
      sub: payload.sub,
      roles,
      isAdmin,
      isEditor,
    };
  }
}
