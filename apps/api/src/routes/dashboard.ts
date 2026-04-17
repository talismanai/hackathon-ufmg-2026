import type { FastifyInstance } from "fastify";

import {
  getDashboardAdherence,
  getDashboardEffectiveness,
  getDashboardSummary
} from "../db/repositories/dashboard-repository.js";

export async function registerDashboardRoutes(
  app: FastifyInstance
): Promise<void> {
  app.get("/api/dashboard/summary", async () => ({
    item: await getDashboardSummary()
  }));

  app.get("/api/dashboard/adherence", async () => ({
    item: await getDashboardAdherence()
  }));

  app.get("/api/dashboard/effectiveness", async () => ({
    item: await getDashboardEffectiveness()
  }));
}
