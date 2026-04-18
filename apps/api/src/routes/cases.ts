import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  addCaseDocuments,
  createCase,
  createLawyerAction,
  getCaseById,
  listCases
} from "../db/repositories/case-repository.js";
import { runCaseDecision } from "../graphs/case-decision-graph.js";
import { getTranscriptMasterFilePath } from "../lib/agent-transcript.js";

const createCaseBodySchema = z.object({
  externalCaseNumber: z.string().min(1).optional(),
  processType: z.string().min(1).optional(),
  plaintiffName: z.string().min(1).optional(),
  uf: z.string().min(1).optional(),
  courtDistrict: z.string().min(1).optional(),
  claimAmountCents: z.number().int().positive().optional(),
  input: z.record(z.string(), z.unknown()).optional()
});

const caseDocumentInputSchema = z.object({
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

const addDocumentsBodySchema = z.union([
  z.object({
    items: z.array(caseDocumentInputSchema).min(1)
  }),
  caseDocumentInputSchema
]);

const analyzeCaseBodySchema = z
  .object({
    policyVersion: z.string().min(1).optional()
  })
  .optional();

const lawyerActionBodySchema = z.object({
  analysisId: z.string().min(1),
  chosenAction: z.enum(["agreement", "defense", "review"]),
  followedRecommendation: z.boolean(),
  offeredValue: z.number().nonnegative().optional(),
  overrideReason: z.string().optional(),
  negotiationStatus: z.string().optional(),
  negotiationValue: z.number().nonnegative().optional(),
  notes: z.string().optional()
});

export async function registerCaseRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/cases", async (request, reply) => {
    const body = createCaseBodySchema.parse(request.body);
    const caseRecord = await createCase(body);

    return reply.code(201).send({
      item: caseRecord
    });
  });

  app.post("/api/cases/:caseId/documents", async (request, reply) => {
    const params = z.object({ caseId: z.string().min(1) }).parse(request.params);
    const body = addDocumentsBodySchema.parse(request.body);
    const caseRecord = await getCaseById(params.caseId);

    if (!caseRecord) {
      return reply.code(404).send({
        message: "Caso nao encontrado."
      });
    }

    const items = "items" in body ? body.items : [body];
    const documents = await addCaseDocuments(params.caseId, items);

    return reply.code(201).send({
      items: documents
    });
  });

  app.get("/api/cases", async () => {
    const cases = await listCases();

    return {
      items: cases
    };
  });

  app.get("/api/cases/:caseId", async (request, reply) => {
    const params = z.object({ caseId: z.string().min(1) }).parse(request.params);
    const caseRecord = await getCaseById(params.caseId);

    if (!caseRecord) {
      return reply.code(404).send({
        message: "Caso nao encontrado."
      });
    }

    return {
      item: caseRecord
    };
  });

  app.post("/api/cases/:caseId/analyze", async (request, reply) => {
    const params = z.object({ caseId: z.string().min(1) }).parse(request.params);
    const body = analyzeCaseBodySchema.parse(request.body);
    const caseRecord = await getCaseById(params.caseId);

    if (!caseRecord) {
      return reply.code(404).send({
        message: "Caso nao encontrado."
      });
    }

    const result = await runCaseDecision({
      caseId: params.caseId,
      policyVersion: body?.policyVersion
    });

    if (result.errors.length > 0 || !result.finalDecision || !result.analysisId) {
      return reply.code(422).send({
        caseId: params.caseId,
        errors: result.errors,
        decision: result.finalDecision ?? null
      });
    }

    return reply.code(201).send({
      analysisId: result.analysisId,
      transcriptPath: getTranscriptMasterFilePath({
        workflowType: "case_decision",
        caseId: params.caseId,
        policyVersion: result.policyVersion
      }),
      traceViewerUrl: `/api/traces/case_decision/${params.caseId}/view`,
      traceJsonUrl: `/api/traces/case_decision/${params.caseId}`,
      decision: result.finalDecision,
      lawyerExplanation: result.lawyerExplanation,
      similarCases: result.similarCases,
      riskScore: result.riskScore,
      errors: result.errors
    });
  });

  app.post("/api/cases/:caseId/lawyer-action", async (request, reply) => {
    const params = z.object({ caseId: z.string().min(1) }).parse(request.params);
    const body = lawyerActionBodySchema.parse(request.body);
    const caseRecord = await getCaseById(params.caseId);

    if (!caseRecord) {
      return reply.code(404).send({
        message: "Caso nao encontrado."
      });
    }

    await createLawyerAction(params.caseId, body);

    return reply.code(201).send({
      caseId: params.caseId,
      status: "recorded"
    });
  });
}
