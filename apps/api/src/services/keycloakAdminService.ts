/**
 * Keycloak Admin REST API client.
 * Uses client_credentials grant to obtain a service token,
 * then manages roles and users via the Keycloak Admin API.
 */
export class KeycloakAdminService {
  private adminUrl: string;
  private clientId: string;
  private clientSecret: string;
  private realm: string;
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(opts: {
    adminUrl: string;
    clientId: string;
    clientSecret: string;
    realm: string;
  }) {
    this.adminUrl = opts.adminUrl.replace(/\/$/, "");
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.realm = opts.realm;
  }

  private async getServiceToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 10_000) {
      return this.cachedToken.token;
    }

    const tokenUrl = `${this.adminUrl}/realms/${this.realm}/protocol/openid-connect/token`;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`Keycloak token request failed: ${res.status}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return this.cachedToken.token;
  }

  private get realmAdminUrl() {
    return `${this.adminUrl}/admin/realms/${this.realm}`;
  }

  private async adminFetch(path: string, init?: RequestInit): Promise<Response> {
    const token = await this.getServiceToken();
    return fetch(`${this.realmAdminUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  }

  private async getUserIdBySub(keycloakSub: string): Promise<string> {
    // Keycloak user ID IS the sub
    return keycloakSub;
  }

  async grantRole(keycloakSub: string, roleName: string): Promise<void> {
    const userId = await this.getUserIdBySub(keycloakSub);

    // Get role representation
    const roleRes = await this.adminFetch(`/roles/${encodeURIComponent(roleName)}`);
    if (!roleRes.ok) {
      throw new Error(`Keycloak role lookup failed for ${roleName}: ${roleRes.status}`);
    }
    const role = (await roleRes.json()) as { id: string; name: string };

    // Assign role to user
    const assignRes = await this.adminFetch(`/users/${userId}/role-mappings/realm`, {
      method: "POST",
      body: JSON.stringify([{ id: role.id, name: role.name }]),
    });
    if (!assignRes.ok) {
      throw new Error(`Keycloak role grant failed: ${assignRes.status}`);
    }
  }

  async revokeRole(keycloakSub: string, roleName: string): Promise<void> {
    const userId = await this.getUserIdBySub(keycloakSub);

    const roleRes = await this.adminFetch(`/roles/${encodeURIComponent(roleName)}`);
    if (!roleRes.ok) {
      throw new Error(`Keycloak role lookup failed for ${roleName}: ${roleRes.status}`);
    }
    const role = (await roleRes.json()) as { id: string; name: string };

    const deleteRes = await this.adminFetch(`/users/${userId}/role-mappings/realm`, {
      method: "DELETE",
      body: JSON.stringify([{ id: role.id, name: role.name }]),
    });
    if (!deleteRes.ok) {
      throw new Error(`Keycloak role revoke failed: ${deleteRes.status}`);
    }
  }

  async listUsers(search?: string, first = 0, max = 50): Promise<Array<{
    id: string;
    username: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    enabled: boolean;
  }>> {
    const params = new URLSearchParams({ first: String(first), max: String(max) });
    if (search) params.set("search", search);

    const res = await this.adminFetch(`/users?${params}`);
    if (!res.ok) {
      throw new Error(`Keycloak list users failed: ${res.status}`);
    }
    return (await res.json()) as Array<{
      id: string;
      username: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      enabled: boolean;
    }>;
  }

  async getUserRoles(keycloakSub: string): Promise<Array<{ id: string; name: string }>> {
    const userId = await this.getUserIdBySub(keycloakSub);
    const res = await this.adminFetch(`/users/${userId}/role-mappings/realm`);
    if (!res.ok) {
      throw new Error(`Keycloak get user roles failed: ${res.status}`);
    }
    return (await res.json()) as Array<{ id: string; name: string }>;
  }
}
