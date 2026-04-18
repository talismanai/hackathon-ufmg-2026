import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { getTranscriptMasterFilePathByExecution } from "../../../../apps/api/src/lib/agent-transcript.js";
import {
  loadWorkflowTraceHtml,
  loadWorkflowTraceVisualization
} from "../../../../apps/api/src/lib/agent-trace-visualization.js";

const traceParamsSchema = z.object({
  workflowType: z.enum(["policy_calibration", "case_decision"]),
  executionId: z.string().min(1)
});

export class TraceApi {
  register(app: FastifyInstance) {
    app.get("/traces/:workflowType/:executionId", async (request, reply) => {
      const params = traceParamsSchema.parse(request.params);
      const transcriptPath = getTranscriptMasterFilePathByExecution(params);

      try {
        await access(transcriptPath, fsConstants.R_OK);
      } catch {
        return reply.code(404).send({
          message: "Transcript nao encontrado."
        });
      }

      return loadWorkflowTraceVisualization(params);
    });

    app.get("/traces/:workflowType/:executionId/view", async (request, reply) => {
      const params = traceParamsSchema.parse(request.params);
      const transcriptPath = getTranscriptMasterFilePathByExecution(params);

      try {
        await access(transcriptPath, fsConstants.R_OK);
      } catch {
        return reply.code(404).send({
          message: "Transcript nao encontrado."
        });
      }

      const html = await loadWorkflowTraceHtml(params);

      return reply.type("text/html; charset=utf-8").send(html);
    });
  }
}
