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
  preferred_username?: string;
  email?: string;
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
    // Case-insensitive Bearer parse + whitespace-tolerant + non-empty token.
    // Reject obviously-malformed short tokens before hitting jose.
    const bearerMatch = /^Bearer\s+(\S+)\s*$/i.exec(authHeader ?? "");
    if (!bearerMatch) {
      throw new Error("missing_bearer");
    }
    const token = bearerMatch[1];
    if (token.length < 16) {
      throw new Error("invalid_token");
    }

    if (!this.jwks || !this.config.issuer) {
      throw new Error("auth_not_configured");
    }

    const expectedAudience = this.config.audience || this.config.clientId;

    let payload: KeycloakPayload;
    try {
      // Pin algorithm to RS256 (Keycloak's default for this realm) to prevent
      // algorithm-confusion attacks where a forged token claims `alg: none`
      // or swaps to a symmetric algorithm keyed off the public key.
      const verified = await jwtVerify(token, this.jwks, {
        issuer: this.config.issuer,
        algorithms: ["RS256"],
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
      preferredUsername: payload.preferred_username,
      email: payload.email,
    };
  }
}
