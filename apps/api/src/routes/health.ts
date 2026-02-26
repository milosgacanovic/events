import type { FastifyPluginAsync } from "fastify";

const healthRoute: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    const dbOk = await app.db
      .query("select 1")
      .then(() => true)
      .catch(() => false);

    const meiliOk = await app.meiliService.healthcheck();
    let currentEventCount: number | null = null;
    let publishedEventCount: number | null = null;

    if (dbOk) {
      const counts = await app.db.query<{
        current_event_count: number;
        published_event_count: number;
      }>(
        `
          select
            count(*)::int as current_event_count,
            count(*) filter (where status = 'published')::int as published_event_count
          from events
        `,
      )
        .then((result) => result.rows[0] ?? null)
        .catch(() => null);

      currentEventCount = counts?.current_event_count ?? null;
      publishedEventCount = counts?.published_event_count ?? null;
    }

    return {
      ok: dbOk && meiliOk,
      db: dbOk ? "ok" : "error",
      meili: meiliOk ? "ok" : "error",
      db_connection_ok: dbOk,
      current_event_count: currentEventCount,
      published_event_count: publishedEventCount,
      version: "0.1.0",
    };
  });
};

export default healthRoute;
