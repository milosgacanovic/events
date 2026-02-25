import type { FastifyPluginAsync } from "fastify";

const healthRoute: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    const dbOk = await app.db
      .query("select 1")
      .then(() => true)
      .catch(() => false);

    const meiliOk = await app.meiliService.healthcheck();

    return {
      ok: dbOk && meiliOk,
      db: dbOk ? "ok" : "error",
      meili: meiliOk ? "ok" : "error",
      version: "0.1.0",
    };
  });
};

export default healthRoute;
