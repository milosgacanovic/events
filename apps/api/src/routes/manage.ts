import type { FastifyPluginAsync } from "fastify";

import { getAdminDashboardStats, getAdminRecentActivity, getDashboardStats } from "../db/manageRepo";
import { resolveUserId } from "../middleware/ownership";

const manageRoutes: FastifyPluginAsync = async (app) => {
  app.get("/manage/dashboard", async (request) => {
    await app.requireEditor(request);

    const auth = request.auth!;
    const userId = await resolveUserId(app.db, auth);

    const editorStats = await getDashboardStats(app.db, userId);

    if (auth.isAdmin) {
      const [adminStats, adminActivity] = await Promise.all([
        getAdminDashboardStats(app.db),
        getAdminRecentActivity(app.db),
      ]);
      return { ...editorStats, recentActivity: adminActivity, admin: adminStats };
    }

    return editorStats;
  });
};

export default manageRoutes;
