type TokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

type AdminEventsResponse = {
  items?: unknown[];
  pagination?: Record<string, unknown>;
};

type JsonResult<T> = {
  status: number;
  body: T;
  raw: string;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing required env: ${name}`);
  }
  return value;
}

function decodeJwtExp(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

class LiveTokenManager {
  private accessToken: string | null = null;
  private expEpochSec: number | null = null;

  constructor(
    private readonly tokenUrl: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  private isUsableToken(): boolean {
    if (!this.accessToken || !this.expEpochSec) {
      return false;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    return this.expEpochSec - nowSec > 20;
  }

  async getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.isUsableToken()) {
      return this.accessToken!;
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const raw = await response.text();
    let parsed: TokenResponse = {};
    try {
      parsed = JSON.parse(raw) as TokenResponse;
    } catch {
      parsed = {};
    }

    if (response.status !== 200 || !parsed.access_token) {
      throw new Error(`token request failed: status=${response.status}, body=${raw}`);
    }

    this.accessToken = parsed.access_token;
    this.expEpochSec = decodeJwtExp(parsed.access_token);
    const expLabel = this.expEpochSec ? new Date(this.expEpochSec * 1000).toISOString() : "unknown";
    console.log(`[live] token acquired (exp=${expLabel})`);
    return this.accessToken;
  }
}

async function requestJsonWithRetry<T>(
  baseUrl: string,
  tokenManager: LiveTokenManager,
  path: string,
  init?: RequestInit,
): Promise<JsonResult<T>> {
  const perform = async (forceRefresh: boolean) => {
    const token = await tokenManager.getAccessToken(forceRefresh);
    const headers: HeadersInit = {
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    };
    return fetch(`${baseUrl}${path}`, { ...init, headers });
  };

  let response = await perform(false);
  if (response.status === 401) {
    console.warn(`[live] 401 on ${path}, refreshing token and retrying once`);
    response = await perform(true);
  }

  const raw = await response.text();
  let parsed: T;
  try {
    parsed = JSON.parse(raw) as T;
  } catch {
    parsed = {} as T;
  }

  if (response.status === 401 || response.status === 403) {
    console.error(`[live] auth failure on ${path}: status=${response.status}`);
  }

  return {
    status: response.status,
    body: parsed,
    raw,
  };
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

async function run(): Promise<void> {
  if (process.env.RUN_LIVE_ADMIN_TEST !== "1") {
    console.log("[live] skipped (set RUN_LIVE_ADMIN_TEST=1 to execute)");
    return;
  }

  const apiBase = normalizeBaseUrl(requireEnv("DR_EVENTS_TEST_API_BASE"));
  const tokenUrl = requireEnv("DR_EVENTS_TEST_TOKEN_URL");
  const clientId = requireEnv("DR_EVENTS_TEST_CLIENT_ID");
  const clientSecret = requireEnv("DR_EVENTS_TEST_CLIENT_SECRET");
  const lookupSource = (process.env.DR_EVENTS_TEST_EXTERNAL_SOURCE ?? "smoke_test").trim();
  const lookupId = (process.env.DR_EVENTS_TEST_EXTERNAL_ID ?? "evt-1").trim();

  const tokenManager = new LiveTokenManager(tokenUrl, clientId, clientSecret);

  console.log(`[live] base=${apiBase}`);
  console.log(`[live] tokenUrl=${tokenUrl}`);

  const health = await requestJsonWithRetry<Record<string, unknown>>(apiBase, tokenManager, "/health", {
    method: "GET",
  });
  console.log(`[live] GET /health -> ${health.status}`);

  const invalidCreate = await requestJsonWithRetry<Record<string, unknown>>(apiBase, tokenManager, "/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  console.log(`[live] POST /events (invalid payload) -> ${invalidCreate.status}`);

  const adminList = await requestJsonWithRetry<AdminEventsResponse>(
    apiBase,
    tokenManager,
    "/admin/events?page=1&pageSize=5",
    { method: "GET" },
  );
  console.log(`[live] GET /admin/events?page=1&pageSize=5 -> ${adminList.status}`);
  console.log(`[live] /admin/events count=${adminList.body.items?.length ?? 0}`);

  const filtered = await requestJsonWithRetry<AdminEventsResponse>(
    apiBase,
    tokenManager,
    `/admin/events?externalSource=${encodeURIComponent(lookupSource)}&externalId=${encodeURIComponent(lookupId)}&page=1&pageSize=20`,
    { method: "GET" },
  );
  console.log(
    `[live] GET /admin/events?externalSource=${lookupSource}&externalId=${lookupId} -> ${filtered.status}`,
  );
  console.log(`[live] filtered count=${filtered.body.items?.length ?? 0}`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[live] failed: ${message}`);
  process.exit(1);
});
