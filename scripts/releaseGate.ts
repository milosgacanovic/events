import { execFileSync } from "node:child_process";

import { Client } from "pg";

type IntegrityAuditSummary = {
  null_event_format: number;
  imported_without_source: number;
  external_id_without_imported_flag: number;
};

type GateCheck = {
  ok: boolean;
  detail: Record<string, unknown>;
};

async function runIntegrityAudit(): Promise<GateCheck> {
  const raw = execFileSync("node", ["--no-warnings", "/opt/events/scripts/audit_event_integrity.ts"], {
    encoding: "utf-8",
  });
  const parsed = JSON.parse(raw) as { integrity_audit_summary?: IntegrityAuditSummary };
  const summary = parsed.integrity_audit_summary ?? {
    null_event_format: -1,
    imported_without_source: -1,
    external_id_without_imported_flag: -1,
  };
  const ok =
    summary.null_event_format === 0 &&
    summary.imported_without_source === 0 &&
    summary.external_id_without_imported_flag === 0;

  return {
    ok,
    detail: summary,
  };
}

async function runOccurrenceSanity(client: Client): Promise<GateCheck> {
  const result = await client.query<{ id: string }>(
    `
      select e.id::text as id
      from events e
      join event_occurrences o on o.event_id = e.id
      where e.schedule_kind = 'single'
        and o.starts_at_utc > now()
      group by e.id
      having count(*) > 1
    `,
  );

  return {
    ok: result.rowCount === 0,
    detail: {
      duplicate_single_event_count: result.rowCount ?? 0,
      duplicate_single_event_ids_sample: result.rows.slice(0, 20).map((row) => row.id),
    },
  };
}

async function fetchMeiliTotalDocs(meiliUrl: string, apiKey: string | null): Promise<number> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const response = await fetch(`${meiliUrl.replace(/\/$/, "")}/stats`, { headers });
  if (!response.ok) {
    throw new Error(`meili_stats_failed_${response.status}`);
  }
  const data = (await response.json()) as {
    indexes?: Record<string, { numberOfDocuments?: number }>;
  };
  return Number(data.indexes?.event_occurrences?.numberOfDocuments ?? 0);
}

async function fetchMeiliFutureDocs(meiliUrl: string, apiKey: string | null, nowIso: string): Promise<number> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const base = meiliUrl.replace(/\/$/, "");
  const total = await fetchMeiliTotalDocs(base, apiKey);
  const pageSize = 1000;
  let scanned = 0;
  let future = 0;

  while (scanned < total) {
    const response = await fetch(`${base}/indexes/event_occurrences/documents?offset=${scanned}&limit=${pageSize}`, {
      headers,
    });
    if (!response.ok) {
      throw new Error(`meili_documents_failed_${response.status}`);
    }
    const body = (await response.json()) as {
      results?: Array<{ starts_at_utc?: string }>;
    };
    const docs = body.results ?? [];
    if (docs.length === 0) {
      break;
    }
    for (const doc of docs) {
      if (typeof doc.starts_at_utc === "string" && doc.starts_at_utc > nowIso) {
        future += 1;
      }
    }
    scanned += docs.length;
  }

  return future;
}

async function runMeiliParity(client: Client): Promise<GateCheck> {
  const meiliUrl = process.env.MEILI_URL ?? "http://127.0.0.1:17700";
  const meiliKey = process.env.MEILI_MASTER_KEY ?? "change_me";
  const nowIso = new Date().toISOString();

  const dbTotalRes = await client.query<{ count: string }>("select count(*)::text as count from event_occurrences");
  const dbFutureRes = await client.query<{ count: string }>(
    "select count(*)::text as count from event_occurrences where starts_at_utc > now()",
  );
  const dbTotal = Number(dbTotalRes.rows[0]?.count ?? "0");
  const dbFuture = Number(dbFutureRes.rows[0]?.count ?? "0");

  const meiliTotal = await fetchMeiliTotalDocs(meiliUrl, meiliKey);
  const meiliFuture = await fetchMeiliFutureDocs(meiliUrl, meiliKey, nowIso);

  return {
    ok: dbTotal === meiliTotal && dbFuture === meiliFuture,
    detail: {
      db_total_occurrences: dbTotal,
      meili_total_docs: meiliTotal,
      db_future_occurrences: dbFuture,
      meili_future_docs: meiliFuture,
    },
  };
}

async function runApiQuicksearch(): Promise<GateCheck> {
  const apiBase = process.env.RELEASE_GATE_API_BASE ?? "https://events.danceresource.org/api";
  const response = await fetch(`${apiBase.replace(/\/$/, "")}/events/search?page=1&pageSize=1`);
  if (!response.ok) {
    return {
      ok: false,
      detail: {
        status: response.status,
      },
    };
  }

  const body = (await response.json()) as {
    totalHits?: number;
    facets?: {
      eventFormatId?: Record<string, number>;
    };
  };
  const totalHits = Number(body.totalHits ?? 0);
  const formatFacetKeys = Object.keys(body.facets?.eventFormatId ?? {});
  const eventFormatFacetKeyCount = formatFacetKeys.length;

  return {
    ok: totalHits > 0 && eventFormatFacetKeyCount >= 6,
    detail: {
      totalHits,
      eventFormatFacetKeyCount,
      eventFormatFacetKeys: formatFacetKeys,
    },
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? "postgresql://dr_events:dr_events_password@localhost:15432/dr_events";
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const integrity = await runIntegrityAudit().catch((error: unknown) => ({
      ok: false,
      detail: { error: error instanceof Error ? error.message : String(error) },
    }));
    const occurrenceSanity = await runOccurrenceSanity(client).catch((error: unknown) => ({
      ok: false,
      detail: { error: error instanceof Error ? error.message : String(error) },
    }));
    const meiliParity = await runMeiliParity(client).catch((error: unknown) => ({
      ok: false,
      detail: { error: error instanceof Error ? error.message : String(error) },
    }));
    const apiQuicksearch = await runApiQuicksearch().catch((error: unknown) => ({
      ok: false,
      detail: { error: error instanceof Error ? error.message : String(error) },
    }));

    const summary = {
      ok: integrity.ok && occurrenceSanity.ok && meiliParity.ok && apiQuicksearch.ok,
      checks: {
        integrity,
        occurrence_sanity: occurrenceSanity,
        meili_parity: meiliParity,
        api_quicksearch: apiQuicksearch,
      },
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ release_gate_summary: summary }, null, 2));

    if (!summary.ok) {
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
