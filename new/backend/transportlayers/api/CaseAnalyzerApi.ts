import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { getTranscriptMasterFilePath } from "../../../../apps/api/src/lib/agent-transcript.js";
import { CaseAnalyzerUseCase } from "../../usecase/CaseAnalyzerUseCase.js";

const caseInputSchema = z.object({
  externalCaseNumber: z.string().min(1).optional(),
  processType: z.string().min(1).optional(),
  plaintiffName: z.string().min(1).optional(),
  uf: z.string().min(1).optional(),
  courtDistrict: z.string().min(1).optional(),
  claimAmountCents: z.number().int().positive().optional(),
  input: z.record(z.string(), z.unknown()).optional()
});

const documentSchema = z.object({
  docType: z.enum([
    "autos",
    "contrato",
    "extrato",
    "comprovante_credito",
    "dossie",
    "demonstrativo_divida",
    "laudo_referenciado"
  ]),
  fileName: z.string().min(1),
  mimeType: z.string().min(1).optional(),
  textContent: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const bodySchema = z.object({
  caseId: z.string().min(1).optional(),
  caseInput: caseInputSchema.optional(),
  policyVersion: z.string().min(1).optional(),
  documents: z.array(documentSchema).min(1)
});

export class CaseAnalyzerApi {
  constructor(private readonly caseAnalyzerUseCase: CaseAnalyzerUseCase) {}

  register(app: FastifyInstance) {
    app.post("/submit", async (request, reply) => {
      const body = bodySchema.parse(request.body);
      const result = await this.caseAnalyzerUseCase.submitDocuments(body);

      return reply.code(201).send({
        caseId: result.caseRecord.id,
        analysisId: result.analysis.analysisId ?? null,
        transcriptPath: getTranscriptMasterFilePath({
          workflowType: "case_decision",
          caseId: result.caseRecord.id,
          policyVersion: result.analysis.policyVersion
        }),
        traceViewerUrl: `/api/traces/case_decision/${result.caseRecord.id}/view`,
        traceJsonUrl: `/api/traces/case_decision/${result.caseRecord.id}`,
        caseRecord: result.caseRecord,
        documents: result.documents,
        localFiles: result.localFiles,
        decision: result.analysis.finalDecision ?? null,
        lawyerExplanation: result.analysis.lawyerExplanation ?? null,
        errors: result.analysis.errors
      });
    });
  }
}
