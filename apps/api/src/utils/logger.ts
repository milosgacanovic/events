import type { FastifyServerOptions } from "fastify";

export const loggerConfig: FastifyServerOptions["logger"] = {
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
};
