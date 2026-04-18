import type { FastifyInstance } from "fastify";

import { DashboardUseCase } from "../../usecase/DashboardUseCase.js";

export class DashboardApi {
  constructor(private readonly dashboardUseCase: DashboardUseCase) {}

  register(app: FastifyInstance) {
    app.get("/analytics", async () => {
      return this.dashboardUseCase.getAnalytics();
    });
  }
}
