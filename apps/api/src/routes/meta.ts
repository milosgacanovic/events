import type { FastifyPluginAsync } from "fastify";

const metaRoutes: FastifyPluginAsync = async (app) => {
  app.get("/meta/taxonomies", async () => {
    const [practicesResult, rolesResult] = await Promise.all([
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
        practiceCategory: "Dance practices",
      },
      practices: {
        categories,
      },
      organizerRoles: rolesResult.rows,
    };
  });
};

export default metaRoutes;
