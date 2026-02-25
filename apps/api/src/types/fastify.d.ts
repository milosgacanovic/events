import type { AuthContext } from "@dr-events/shared";
import type { MeilisearchService } from "../services/meiliService";
import type { Pool } from "pg";

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }

  interface FastifyInstance {
    db: Pool;
    meiliService: MeilisearchService;
    authenticate: (request: FastifyRequest) => Promise<void>;
    requireEditor: (request: FastifyRequest) => Promise<void>;
    requireAdmin: (request: FastifyRequest) => Promise<void>;
  }
}
