import type {
  CaseDecision,
  CaseDocument,
  CaseRecord,
  CritiqueResult,
  DecisionDraft,
  ExtractedFacts,
  LawyerActionInput,
  RiskScore,
  SimilarCasesSummary,
  StoredCaseAnalysis
} from "@grupo4/shared";
import {
  caseRecordSchema,
  storedCaseAnalysisSchema
} from "@grupo4/shared";

import { prisma } from "../client.js";
import { parseJson, safeStringify } from "../../lib/json.js";
import type { CreateCaseFeedbackInput } from "../../repositories/SQLiteRepository.js";

type CreateCaseInput = {
  externalCaseNumber?: string;
  processType?: string;
  plaintiffName?: string;
  uf?: string;
  courtDistrict?: string;
  claimAmountCents?: number;
  input?: Record<string, unknown>;
};

type AddCaseDocumentInput = {
  docType: CaseDocument["docType"];
  fileName: string;
  mimeType?: string;
  textContent: string;
  metadata?: Record<string, unknown>;
};

type PersistAnalysisInput = {
  caseId: string;
  policyVersion: string;
  facts: ExtractedFacts;
  factsCritique?: CritiqueResult;
  contradictions?: Record<string, unknown>;
  similarCases?: SimilarCasesSummary;
  risk: RiskScore;
  decisionDraft?: DecisionDraft;
  decisionCritique?: CritiqueResult;
  decision: CaseDecision;
  explanationText?: string;
};

function mapCaseDocument(document: {
  id: string;
  caseId: string;
  docType: string;
  fileName: string;
  mimeType: string;
  textContent: string;
  metadataJson: string | null;
}): CaseDocument {
  return {
    id: document.id,
    caseId: document.caseId,
    docType: document.docType as CaseDocument["docType"],
    fileName: document.fileName,
    mimeType: document.mimeType,
    textContent: document.textContent,
    metadata: parseJson<Record<string, unknown> | undefined>(
      document.metadataJson,
      undefined
    )
  };
}

function mapStoredCaseAnalysis(analysis: {
  id: string;
  caseId: string;
  policyVersion: string;
  factsJson: string;
  contradictionsJson: string | null;
  similarCasesJson: string | null;
  riskJson: string;
  decisionDraftJson: string | null;
  decisionCritiqueJson: string | null;
  decisionJson: string;
  usedRulesJson: string | null;
  evidenceRefsJson: string | null;
  critiqueSummary: string | null;
  recommendedAction: string | null;
  confidenceScore: number | null;
  offerMinCents: number | null;
  offerTargetCents: number | null;
  offerMaxCents: number | null;
  explanationShort: string | null;
  explanationText: string | null;
  generatedAt: Date;
  createdAt: Date;
}): StoredCaseAnalysis {
  return storedCaseAnalysisSchema.parse({
    id: analysis.id,
    caseId: analysis.caseId,
    policyVersion: analysis.policyVersion,
    facts: parseJson<ExtractedFacts>(analysis.factsJson, {
      contractPresent: false,
      creditProofPresent: false,
      creditProofValid: false,
      matchingDepositFound: false,
      dossierStatus: "missing",
      debtEvolutionPresent: false,
      referenceReportPresent: false,
      materialContradictions: 0,
      missingCriticalDocuments: 0,
      plaintiffClaimsNonRecognition: false,
      evidenceRefs: []
    }),
    contradictions: parseJson<Record<string, unknown> | null>(
      analysis.contradictionsJson,
      null
    ),
    similarCases: parseJson<SimilarCasesSummary | null>(
      analysis.similarCasesJson,
      null
    ),
    risk: parseJson<RiskScore>(analysis.riskJson, {
      lossProbability: 0,
      expectedCondemnation: 0,
      expectedJudicialCost: 0,
      riskBand: "low"
    }),
    decisionDraft: parseJson<DecisionDraft | null>(
      analysis.decisionDraftJson,
      null
    ),
    decisionCritique: parseJson<CritiqueResult | null>(
      analysis.decisionCritiqueJson,
      null
    ),
    decision: parseJson<CaseDecision>(analysis.decisionJson, {
      action: "review",
      confidence: 0,
      usedRules: [],
      expectedJudicialCost: 0,
      expectedCondemnation: 0,
      lossProbability: 0,
      explanationShort: "",
      evidenceRefs: []
    }),
    usedRules: parseJson<string[]>(analysis.usedRulesJson, []),
    evidenceRefs: parseJson<CaseDecision["evidenceRefs"]>(
      analysis.evidenceRefsJson,
      []
    ),
    critiqueSummary: analysis.critiqueSummary,
    recommendedAction: analysis.recommendedAction,
    confidenceScore: analysis.confidenceScore,
    offerMinCents: analysis.offerMinCents,
    offerTargetCents: analysis.offerTargetCents,
    offerMaxCents: analysis.offerMaxCents,
    explanationShort: analysis.explanationShort,
    explanationText: analysis.explanationText,
    generatedAt: analysis.generatedAt.toISOString(),
    createdAt: analysis.createdAt.toISOString()
  });
}

function mapCaseRecord(caseRecord: {
  id: string;
  externalCaseNumber: string | null;
  processType: string | null;
  plaintiffName: string | null;
  uf: string | null;
  courtDistrict: string | null;
  claimAmountCents: number | null;
  status: string;
  inputJson: string | null;
  createdAt: Date;
  updatedAt: Date;
  documents: Array<{
    id: string;
    caseId: string;
    docType: string;
    fileName: string;
    mimeType: string;
    textContent: string;
    metadataJson: string | null;
  }>;
  analyses?: Array<{
    id: string;
    caseId: string;
    policyVersion: string;
    factsJson: string;
    contradictionsJson: string | null;
    similarCasesJson: string | null;
    riskJson: string;
    decisionDraftJson: string | null;
    decisionCritiqueJson: string | null;
    decisionJson: string;
    usedRulesJson: string | null;
    evidenceRefsJson: string | null;
    critiqueSummary: string | null;
    recommendedAction: string | null;
    confidenceScore: number | null;
    offerMinCents: number | null;
    offerTargetCents: number | null;
    offerMaxCents: number | null;
    explanationShort: string | null;
    explanationText: string | null;
    generatedAt: Date;
    createdAt: Date;
  }>;
  feedbacks?: Array<{
    id: string;
    approvalStatus: string;
    feedbackText: string;
    createdAt: Date;
  }>;
}): CaseRecord {
  return caseRecordSchema.parse({
    id: caseRecord.id,
    externalCaseNumber: caseRecord.externalCaseNumber,
    processType: caseRecord.processType,
    plaintiffName: caseRecord.plaintiffName,
    uf: caseRecord.uf,
    courtDistrict: caseRecord.courtDistrict,
    claimAmountCents: caseRecord.claimAmountCents,
    status: caseRecord.status,
    input: parseJson<Record<string, unknown> | undefined>(
      caseRecord.inputJson,
      undefined
    ),
    createdAt: caseRecord.createdAt.toISOString(),
    updatedAt: caseRecord.updatedAt.toISOString(),
    documents: caseRecord.documents.map(mapCaseDocument),
    latestAnalysis: caseRecord.analyses?.[0]
      ? mapStoredCaseAnalysis(caseRecord.analyses[0])
      : undefined,
    latestFeedback: caseRecord.feedbacks?.[0]
      ? {
          id: caseRecord.feedbacks[0].id,
          approvalStatus:
            caseRecord.feedbacks[0].approvalStatus === "approved"
              ? "approved"
              : "rejected",
          feedbackText: caseRecord.feedbacks[0].feedbackText,
          createdAt: caseRecord.feedbacks[0].createdAt.toISOString()
        }
      : undefined
  });
}

export async function createCase(input: CreateCaseInput): Promise<CaseRecord> {
  const caseRecord = await prisma.case.create({
    include: {
      documents: true,
      analyses: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      },
      feedbacks: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    },
    data: {
      externalCaseNumber: input.externalCaseNumber ?? null,
      processType: input.processType ?? null,
      plaintiffName: input.plaintiffName ?? null,
      uf: input.uf ?? null,
      courtDistrict: input.courtDistrict ?? null,
      claimAmountCents: input.claimAmountCents ?? null,
      inputJson: input.input ? safeStringify(input.input) : null
    }
  });

  return mapCaseRecord(caseRecord);
}

export async function addCaseDocuments(
  caseId: string,
  documents: AddCaseDocumentInput[]
): Promise<CaseDocument[]> {
  const createdDocuments = await Promise.all(
    documents.map((document) =>
      prisma.caseDocument.create({
        data: {
          caseId,
          docType: document.docType,
          fileName: document.fileName,
          mimeType: document.mimeType ?? "text/plain",
          textContent: document.textContent,
          metadataJson: document.metadata
            ? safeStringify(document.metadata)
            : null
        }
      })
    )
  );

  return createdDocuments.map(mapCaseDocument);
}

export async function listCases(): Promise<CaseRecord[]> {
  const cases = await prisma.case.findMany({
    include: {
      documents: true,
      analyses: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      },
      feedbacks: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return cases.map(mapCaseRecord);
}

export async function getCaseById(caseId: string): Promise<CaseRecord | null> {
  const caseRecord = await prisma.case.findUnique({
    where: {
      id: caseId
    },
    include: {
      documents: true,
      analyses: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      },
      feedbacks: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    }
  });

  return caseRecord ? mapCaseRecord(caseRecord) : null;
}

function normalizeCaseNumber(value: string) {
  return value.replace(/\D/g, "");
}

export async function getCaseByExternalCaseNumber(
  externalCaseNumber: string
): Promise<CaseRecord | null> {
  const exactMatch = await prisma.case.findFirst({
    where: {
      externalCaseNumber
    },
    include: {
      documents: true,
      analyses: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      },
      feedbacks: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (exactMatch) {
    return mapCaseRecord(exactMatch);
  }

  const normalizedQuery = normalizeCaseNumber(externalCaseNumber);

  if (!normalizedQuery) {
    return null;
  }

  const possibleMatches = await prisma.case.findMany({
    where: {
      externalCaseNumber: {
        not: null
      }
    },
    include: {
      documents: true,
      analyses: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      },
      feedbacks: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  const normalizedMatch = possibleMatches.find((caseRecord) =>
    normalizeCaseNumber(caseRecord.externalCaseNumber ?? "") === normalizedQuery
  );

  return normalizedMatch ? mapCaseRecord(normalizedMatch) : null;
}

export async function getCaseDocuments(caseId: string): Promise<CaseDocument[]> {
  const documents = await prisma.caseDocument.findMany({
    where: {
      caseId
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  return documents.map(mapCaseDocument);
}

export async function persistCaseAnalysis(
  input: PersistAnalysisInput
): Promise<{ analysisId: string }> {
  const extractedFactsRun = await prisma.extractedFactsRun.create({
    data: {
      caseId: input.caseId,
      factsJson: safeStringify(input.facts),
      critiqueJson: input.factsCritique
        ? safeStringify(input.factsCritique)
        : null,
      normalizedFactsJson: safeStringify(input.facts)
    }
  });

  const analysis = await prisma.caseAnalysis.create({
    data: {
      caseId: input.caseId,
      policyVersion: input.policyVersion,
      factsJson: safeStringify(input.facts),
      contradictionsJson: input.contradictions
        ? safeStringify(input.contradictions)
        : null,
      similarCasesJson: input.similarCases
        ? safeStringify(input.similarCases)
        : null,
      riskJson: safeStringify(input.risk),
      decisionDraftJson: input.decisionDraft
        ? safeStringify(input.decisionDraft)
        : null,
      decisionCritiqueJson: input.decisionCritique
        ? safeStringify(input.decisionCritique)
        : null,
      decisionJson: safeStringify(input.decision),
      usedRulesJson: safeStringify(input.decision.usedRules),
      evidenceRefsJson: safeStringify(input.decision.evidenceRefs),
      critiqueSummary: input.decisionCritique?.issues.join(" | ") ?? null,
      recommendedAction: input.decision.action,
      confidenceScore: input.decision.confidence,
      offerMinCents: input.decision.offerMin
        ? Math.round(input.decision.offerMin * 100)
        : null,
      offerTargetCents: input.decision.offerTarget
        ? Math.round(input.decision.offerTarget * 100)
        : null,
      offerMaxCents: input.decision.offerMax
        ? Math.round(input.decision.offerMax * 100)
        : null,
      explanationShort: input.decision.explanationShort,
      explanationText: input.explanationText ?? null
    }
  });

  await prisma.case.update({
    where: {
      id: input.caseId
    },
    data: {
      status: "analyzed"
    }
  });

  return {
    analysisId: analysis.id || extractedFactsRun.id
  };
}

export async function createLawyerAction(
  caseId: string,
  input: LawyerActionInput
): Promise<void> {
  await prisma.lawyerAction.create({
    data: {
      caseId,
      analysisId: input.analysisId,
      chosenAction: input.chosenAction,
      followedRecommendation: input.followedRecommendation,
      offeredValueBrl: input.offeredValue ?? null,
      overrideReason: input.overrideReason ?? null,
      negotiationStatus: input.negotiationStatus ?? null,
      negotiationValueBrl: input.negotiationValue ?? null,
      notes: input.notes ?? null
    }
  });

  await prisma.case.update({
    where: {
      id: caseId
    },
    data: {
      status: "actioned"
    }
  });
}

export async function createCaseFeedback(
  caseId: string,
  input: CreateCaseFeedbackInput
): Promise<{
  id: string;
  caseId: string;
  analysisId: string;
  externalCaseNumber: string | null;
  aiRecommendation: string;
  approvalStatus: string;
  feedbackText: string;
  estimatedCauseValueBrl: number | null;
  createdAt: string;
}> {
  const caseRecord = await prisma.case.findUnique({
    where: {
      id: caseId
    },
    include: {
      analyses: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    }
  });

  if (!caseRecord) {
    throw new Error("Caso nao encontrado.");
  }

  const resolvedAnalysisId = input.analysisId ?? caseRecord.analyses[0]?.id;

  if (!resolvedAnalysisId) {
    throw new Error("Analise do caso nao encontrada.");
  }

  const analysis = await prisma.caseAnalysis.findUnique({
    where: {
      id: resolvedAnalysisId
    }
  });

  if (!analysis || analysis.caseId !== caseId) {
    throw new Error("Analise do caso nao encontrada.");
  }

  const aiRecommendation = analysis.recommendedAction ?? "review";
  const claimAmountBrl =
    typeof caseRecord.claimAmountCents === "number"
      ? caseRecord.claimAmountCents / 100
      : null;
  const decision = parseJson<CaseDecision>(analysis.decisionJson, {
    action: "review",
    confidence: 0,
    usedRules: [],
    expectedJudicialCost: 0,
    expectedCondemnation: 0,
    lossProbability: 0,
    explanationShort: "",
    evidenceRefs: []
  });

  let estimatedCauseValueBrl: number | null = null;

  if (input.approvalStatus === "approved" && claimAmountBrl !== null) {
    if (aiRecommendation === "agreement") {
      const agreementValue =
        typeof decision.offerMax === "number"
          ? decision.offerMax
          : typeof decision.offerTarget === "number"
            ? decision.offerTarget
            : 0;

      estimatedCauseValueBrl = Math.max(0, claimAmountBrl - agreementValue);
    } else if (aiRecommendation === "defense") {
      estimatedCauseValueBrl = Math.max(
        0,
        claimAmountBrl - (decision.expectedCondemnation ?? 0)
      );
    }
  }

  const feedback = await prisma.caseFeedback.create({
    data: {
      caseId,
      analysisId: resolvedAnalysisId,
      feedbackText: input.feedbackText,
      approvalStatus: input.approvalStatus,
      aiRecommendation,
      estimatedCauseValueBrl
    }
  });

  await prisma.case.update({
    where: {
      id: caseId
    },
    data: {
      status: "actioned"
    }
  });

  return {
    id: feedback.id,
    caseId: feedback.caseId,
    analysisId: feedback.analysisId,
    externalCaseNumber: caseRecord.externalCaseNumber,
    aiRecommendation: feedback.aiRecommendation,
    approvalStatus: feedback.approvalStatus,
    feedbackText: feedback.feedbackText,
    estimatedCauseValueBrl: feedback.estimatedCauseValueBrl,
    createdAt: feedback.createdAt.toISOString()
  };
}
