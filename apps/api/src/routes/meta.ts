import type { FastifyPluginAsync } from "fastify";

import { getUiLabels } from "../db/uiLabelRepo";

const metaRoutes: FastifyPluginAsync = async (app) => {
  app.get("/meta/taxonomies", async () => {
    const [practicesResult, rolesResult, eventFormatsResult, uiLabels] = await Promise.all([
      app.db.query<{
        id: string;
        parent_id: string | null;
        level: number;
        key: string;
        label: string;
        sort_order: number;
        is_active: boolean;
      }>(
        `
          select id, parent_id, level, key, label, sort_order, is_active
          from practices
          where is_active = true
          order by level asc, sort_order asc, label asc
        `,
      ),
      app.db.query<{
        id: string;
        key: string;
        label: string;
        sort_order: number;
      }>(
        `
          select id, key, label, sort_order
          from organizer_roles
          where is_active = true
          order by sort_order asc, label asc
        `,
      ),
      app.db.query<{
        id: string;
        key: string;
        label: string;
        sort_order: number;
      }>(
        `
          select id, key, label, sort_order
          from event_formats
          where is_active = true
          order by sort_order asc, label asc
        `,
      ),
      getUiLabels(app.db),
    ]);

    const categories = practicesResult.rows
      .filter((practice) => practice.level === 1)
      .map((category) => ({
        id: category.id,
        key: category.key,
        label: category.label,
        subcategories: practicesResult.rows
          .filter((sub) => sub.parent_id === category.id)
          .map((sub) => ({
            id: sub.id,
            key: sub.key,
            label: sub.label,
          })),
      }));

    return {
      uiLabels: {
        categorySingular: uiLabels.categorySingular,
        categoryPlural: uiLabels.categoryPlural,
        // Backward-compatibility for existing clients while shifting terminology.
        practiceCategory: uiLabels.categoryPlural,
      },
      practices: {
        categories,
      },
      organizerRoles: rolesResult.rows,
      eventFormats: eventFormatsResult.rows,
    };
  });
};

export default metaRoutes;
