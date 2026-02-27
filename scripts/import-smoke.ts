type KeycloakTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type TaxonomyResponse = {
  practices?: {
    categories?: Array<{ id: string }>;
  };
};

type AdminEventsResponse = {
  items?: Array<{ id: string; slug: string }>;
};

const EXTERNAL_SOURCE = "smoke_test";
const EXTERNAL_ID = "evt-1";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing required env: ${name}`);
  }
  return value;
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveTokenUrl(): string {
  const explicit = process.env.IMPORT_SMOKE_TOKEN_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const issuer = process.env.KEYCLOAK_ISSUER?.trim();
  if (!issuer) {
    throw new Error("missing IMPORT_SMOKE_TOKEN_URL (or KEYCLOAK_ISSUER fallback)");
  }

  return `${issuer.replace(/\/$/, "")}/protocol/openid-connect/token`;
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<{
  status: number;
  body: T;
  raw: string;
}> {
  const response = await fetch(input, init);
  const raw = await response.text();

  let parsed: T;
  try {
    parsed = JSON.parse(raw) as T;
  } catch {
    parsed = {} as T;
  }

  return { status: response.status, body: parsed, raw };
}

async function getClientCredentialsToken(tokenUrl: string, clientId: string, clientSecret: string): Promise<string> {
  const payload = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const { status, body, raw } = await requestJson<KeycloakTokenResponse>(tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  if (status !== 200 || !body.access_token) {
    throw new Error(`token request failed: status=${status}, body=${raw}`);
  }

  return body.access_token;
}

function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

async function run(): Promise<void> {
  const baseUrl = normalizeBaseUrl(requiredEnv("IMPORT_SMOKE_BASE_URL"));
  const clientId = requiredEnv("IMPORT_SMOKE_CLIENT_ID");
  const clientSecret = requiredEnv("IMPORT_SMOKE_CLIENT_SECRET");
  const tokenUrl = resolveTokenUrl();

  console.log(`[smoke] baseUrl=${baseUrl}`);
  console.log(`[smoke] tokenUrl=${tokenUrl}`);

  const token = await getClientCredentialsToken(tokenUrl, clientId, clientSecret);
  console.log("[smoke] token acquired");

  const invalidProbe = await requestJson<Record<string, unknown>>(`${baseUrl}/api/events`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({}),
  });

  if (invalidProbe.status !== 400) {
    throw new Error(
      `auth probe failed: expected 400 from protected endpoint validation, got ${invalidProbe.status}, body=${invalidProbe.raw}`,
    );
  }
  console.log("[smoke] auth probe passed (POST /api/events invalid payload -> 400)");

  const taxonomies = await requestJson<TaxonomyResponse>(`${baseUrl}/api/meta/taxonomies`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });

  if (taxonomies.status !== 200) {
    throw new Error(`taxonomy fetch failed: status=${taxonomies.status}, body=${taxonomies.raw}`);
  }

  const practiceCategoryId = taxonomies.body.practices?.categories?.[0]?.id;
  if (!practiceCategoryId) {
    throw new Error(
      "no practice categories found. Run `npm run seed -w @dr-events/api` and retry.",
    );
  }

  const now = new Date();
  const start = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const createPayload = {
    title: "Smoke Test Event",
    descriptionJson: { smoke: true },
    attendanceMode: "in_person",
    practiceCategoryId,
    scheduleKind: "single",
    eventTimezone: "UTC",
    singleStartAt: start.toISOString(),
    singleEndAt: end.toISOString(),
    visibility: "public",
    tags: ["smoke"],
    languages: ["en"],
    organizerRoles: [],
    externalSource: EXTERNAL_SOURCE,
    externalId: EXTERNAL_ID,
    isImported: true,
    importSource: EXTERNAL_SOURCE,
  };

  const create = await requestJson<{ id?: string; slug?: string }>(`${baseUrl}/api/events`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(createPayload),
  });

  if (create.status !== 201 || !create.body.id) {
    if (create.status === 409) {
      throw new Error(
        "create returned 409 on first attempt. Reset smoke event external refs or use a clean environment before rerun.",
      );
    }
    throw new Error(`create failed: status=${create.status}, body=${create.raw}`);
  }

  const eventId = create.body.id;
  console.log(`[smoke] event created: id=${eventId}`);

  const publish = await requestJson<{ ok?: boolean }>(`${baseUrl}/api/events/${eventId}/publish`, {
    method: "POST",
    headers: authHeaders(token),
  });

  if (publish.status !== 200 || publish.body.ok !== true) {
    throw new Error(`publish failed: status=${publish.status}, body=${publish.raw}`);
  }
  console.log("[smoke] event published");

  const duplicateCreate = await requestJson<Record<string, unknown>>(`${baseUrl}/api/events`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(createPayload),
  });

  if (duplicateCreate.status !== 409) {
    throw new Error(
      `duplicate create check failed: expected 409, got ${duplicateCreate.status}, body=${duplicateCreate.raw}`,
    );
  }
  console.log("[smoke] duplicate create returned 409 as expected");

  const lookup = await requestJson<AdminEventsResponse>(
    `${baseUrl}/api/admin/events?externalSource=${encodeURIComponent(EXTERNAL_SOURCE)}&externalId=${encodeURIComponent(EXTERNAL_ID)}&page=1&pageSize=20`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    },
  );

  if (lookup.status !== 200) {
    throw new Error(`admin lookup failed: status=${lookup.status}, body=${lookup.raw}`);
  }

  const items = lookup.body.items ?? [];
  if (items.length !== 1) {
    throw new Error(`admin lookup expected exactly 1 match, got ${items.length} for ${EXTERNAL_SOURCE}/${EXTERNAL_ID}`);
  }

  const resolved = items[0];
  if (!resolved?.id) {
    throw new Error(`admin lookup match is missing id for ${EXTERNAL_SOURCE}/${EXTERNAL_ID}`);
  }
  console.log(`[smoke] resolved event id via admin lookup: ${resolved.id}`);
  console.log("[smoke] completed successfully");
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[smoke] failed: ${message}`);
  process.exit(1);
});
