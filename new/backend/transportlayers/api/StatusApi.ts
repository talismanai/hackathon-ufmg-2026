import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { StatusUseCase } from "../../usecase/StatusUseCase.js";

const querySchema = z.object({
  caseId: z.string().min(1)
});

export class StatusApi {
  constructor(private readonly statusUseCase: StatusUseCase) {}

  register(app: FastifyInstance) {
    app.get("/status", async (request) => {
      const query = querySchema.parse(request.query);

      return this.statusUseCase.getStatus(query.caseId);
    });
  }
}
