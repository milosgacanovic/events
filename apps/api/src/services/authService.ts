import { ROLE_ADMIN, ROLE_EDITOR, type AuthContext } from "@dr-events/shared";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type AuthConfig = {
  issuer?: string;
  jwksUrl?: string;
  audience?: string;
  clientId?: string;
};

type KeycloakPayload = JWTPayload & {
  azp?: string;
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
};

export function extractRolesFromPayload(payload: KeycloakPayload, clientId?: string): string[] {
  const realmRoles = payload.realm_access?.roles ?? [];
  const clientRoles = clientId ? payload.resource_access?.[clientId]?.roles ?? [] : [];
  return Array.from(new Set([...realmRoles, ...clientRoles]));
}

export function matchesExpectedAudience(payload: KeycloakPayload, expectedAudience?: string): boolean {
  if (!expectedAudience) {
    return true;
  }

  const aud = payload.aud;
  const audienceMatches = typeof aud === "string"
    ? aud === expectedAudience
    : Array.isArray(aud)
      ? aud.includes(expectedAudience)
      : false;

  return audienceMatches || payload.azp === expectedAudience;
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

    if (!this.jwks || !this.config.issuer) {
      throw new Error("auth_not_configured");
    }

    const token = authHeader.slice("Bearer ".length);
    const expectedAudience = this.config.audience || this.config.clientId;

    let payload: KeycloakPayload;
    try {
      const verified = await jwtVerify(token, this.jwks, {
        issuer: this.config.issuer,
      });
      payload = verified.payload as KeycloakPayload;
    } catch {
      throw new Error("invalid_token");
    }

    if (!matchesExpectedAudience(payload, expectedAudience)) {
      throw new Error("invalid_audience");
    }

    if (!payload.sub) {
      throw new Error("invalid_subject");
    }

    const roles = this.extractRoles(payload);
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
