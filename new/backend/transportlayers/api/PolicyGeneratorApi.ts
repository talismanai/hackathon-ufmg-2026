import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { getTranscriptMasterFilePath } from "../../../../apps/api/src/lib/agent-transcript.js";
import { PolicyGeneratorUseCase } from "../../usecase/PolicyGeneratorUseCase.js";

const bodySchema = z.object({
  runId: z.string().min(1),
  inputCsvPath: z.string().min(1).optional(),
  logsPath: z.string().min(1).optional()
});

export class PolicyGeneratorApi {
  constructor(private readonly policyGeneratorUseCase: PolicyGeneratorUseCase) {}

  register(app: FastifyInstance) {
    app.post("/generate", async (request, reply) => {
      const body = bodySchema.parse(request.body);
      const result = await this.policyGeneratorUseCase.execute(body);

      return reply.code(201).send({
        runId: result.state.runId,
        transcriptPath: getTranscriptMasterFilePath({
          workflowType: "policy_calibration",
          runId: result.state.runId,
          logsPath: body.logsPath
        }),
        traceViewerUrl: `/api/traces/policy_calibration/${result.state.runId}/view`,
        traceJsonUrl: `/api/traces/policy_calibration/${result.state.runId}`,
        summary: result.summary,
        publishedPolicy: result.state.publishedPolicy ?? null,
        errors: result.state.errors
      });
    });
  }
}
