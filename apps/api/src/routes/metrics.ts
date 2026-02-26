import type { FastifyPluginAsync } from "fastify";

import { getMetricsSnapshot } from "../services/metricsStore";

const metricsRoute: FastifyPluginAsync = async (app) => {
  app.get("/metrics", async () => {
    return getMetricsSnapshot();
  });
};

export default metricsRoute;
