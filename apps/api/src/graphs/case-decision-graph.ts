import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  CASE_DECISION_WORKFLOW,
  caseDecisionSchema,
  critiqueResultSchema,
  decisionDraftSchema,
  extractedFactsSchema,
  similarCasesSummarySchema,
  riskScoreSchema,
  type CaseDecisionState
} from "@grupo4/shared";

import { critiqueDecision } from "../agents/critique-decision.js";
import { explainForLawyer } from "../agents/explain-for-lawyer.js";
import { extractFactsAction } from "../agents/extract-facts-action.js";
import { extractFactsCritique } from "../agents/extract-facts-critique.js";
import { proposeDecisionAction } from "../agents/propose-decision-action.js";
import { createAgentRun } from "../db/repositories/agent-run-repository.js";
import { persistCaseAnalysis } from "../db/repositories/case-repository.js";
import {
  finalizeExtractedFacts,
  finalizeCaseDecision
} from "../lib/case-decision.js";
import { ingestCase } from "../services/case-decision/ingest-case.js";
import { retrieveSimilarCases } from "../services/case-decision/retrieve-similar-cases.js";
import { scoreCaseRisk } from "../services/case-decision/score-risk.js";

const caseDecisionState = Annotation.Root({
  caseId: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => ""
  }),
  policyVersion: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => ""
  }),
  activePolicy: Annotation<CaseDecisionState["activePolicy"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  caseRecord: Annotation<CaseDecisionState["caseRecord"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  documents: Annotation<CaseDecisionState["documents"]>({
    reducer: (_current, update) => update,
    default: () => []
  }),
  rawTextByDocType: Annotation<CaseDecisionState["rawTextByDocType"]>({
    reducer: (_current, update) => update,
    default: () => ({})
  }),
  extractedFactsDraft: Annotation<CaseDecisionState["extractedFactsDraft"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  extractedFactsCritique: Annotation<CaseDecisionState["extractedFactsCritique"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  normalizedFacts: Annotation<CaseDecisionState["normalizedFacts"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  similarCases: Annotation<CaseDecisionState["similarCases"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  riskScore: Annotation<CaseDecisionState["riskScore"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  decisionDraft: Annotation<CaseDecisionState["decisionDraft"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  decisionCritique: Annotation<CaseDecisionState["decisionCritique"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  finalDecision: Annotation<CaseDecisionState["finalDecision"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  lawyerExplanation: Annotation<CaseDecisionState["lawyerExplanation"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  analysisId: Annotation<CaseDecisionState["analysisId"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  errors: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => []
  })
});

async function runNode<TDelta extends Partial<CaseDecisionState>>(
  agentName: string,
  state: CaseDecisionState,
  fn: () => Promise<TDelta>
): Promise<TDelta> {
  if (state.errors.length > 0) {
    return {} as TDelta;
  }

  try {
    const delta = await fn();
    await createAgentRun({
      workflowType: CASE_DECISION_WORKFLOW,
      caseId: state.caseId,
      agentName,
      input: {
        caseId: state.caseId,
        policyVersion: state.policyVersion,
        documentCount: state.documents.length
      },
      output: delta
    });
    return delta;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha desconhecida na analise.";
    const errors = [...state.errors, `${agentName}: ${message}`];

    await createAgentRun({
      workflowType: CASE_DECISION_WORKFLOW,
      caseId: state.caseId,
      agentName,
      input: {
        caseId: state.caseId,
        policyVersion: state.policyVersion
      },
      output: {
        errors
      }
    });

    return {
      errors
    } as TDelta;
  }
}

async function ingestCaseNode(
  state: CaseDecisionState
): Promise<Partial<CaseDecisionState>> {
  return runNode("ingestCase", state, async () =>
    ingestCase(state.caseId, state.policyVersion || undefined)
  );
}

async function extractFactsActionNode(
  state: CaseDecisionState
): Promise<Partial<CaseDecisionState>> {
  return runNode("extractFactsAction", state, async () => ({
    extractedFactsDraft: extractedFactsSchema.parse(
      await extractFactsAction(state.documents)
    )
  }));
}

async function extractFactsCritiqueNode(
  state: CaseDecisionState
): Promise<Partial<CaseDecisionState>> {
  return runNode("extractFactsCritique", state, async () => ({
    extractedFactsCritique: critiqueResultSchema.parse(
      await extractFactsCritique(
        state.extractedFactsDraft ??
          (() => {
            throw new Error("Nao foi possivel criticar fatos sem o draft inicial.");
          })(),
        state.documents
      )
    )
  }));
}

async function finalizeFactsNode(
  state: CaseDecisionState
): Promise<Partial<CaseDecisionState>> {
  return runNode("finalizeFacts", state, async () => {
    if (!state.extractedFactsDraft || !state.extractedFactsCritique) {
      throw new Error("Nao foi possivel consolidar fatos sem draft e critica.");
    }

    return {
      normalizedFacts: extractedFactsSchema.parse(
        finalizeExtractedFacts(
          state.extractedFactsDraft,
          state.extractedFactsCritique
        )
      )
    };
  });
}

async function retrieveSimilarCasesNode(
  state: CaseDecisionState
): Promise<Partial<CaseDecisionState>> {
  return runNode("retrieveSimilarCases", state, async () => {
    if (!state.caseRecord || !state.normalizedFacts) {
      throw new Error("Nao foi possivel recuperar historico similar sem caso e fatos.");
    }

    return {
      similarCases: similarCasesSummarySchema.parse(
        await retrieveSimilarCases(state.caseRecord, state.normalizedFacts)
      )
    };
  });
}

async function scoreRiskNode(
  state: CaseDecisionState
): Promise<Partial<CaseDecisionState>> {
  return runNode("scoreRisk", state, async () => {
    if (!state.similarCases) {
      throw new Error("Nao foi possivel calcular risco sem casos similares.");
    }

    return {
      riskScore: riskScoreSchema.parse(scoreCaseRisk(state.similarCases))
    };
  });
}

async function proposeDecisionActionNode(
  state: CaseDecisionState
): Promise<Partial<CaseDecisionState>> {
  return runNode("proposeDecisionAction", state, async () => {
    if (!state.activePolicy || !state.caseRecord || !state.normalizedFacts || !state.riskScore) {
      throw new Error("Estado insuficiente para propor decisao.");
    }

    return {
      decisionDraft: decisionDraftSchema.parse(
        await proposeDecisionAction(
          state.activePolicy,
          state.caseRecord,
          state.normalizedFacts,
          state.riskScore
        )
      )
    };
  });
}

async function critiqueDecisionNode(
  state: CaseDecisionState
): Promise<Partial<CaseDecisionState>> {
  return runNode("critiqueDecision", state, async () => {
    if (!state.decisionDraft || !state.normalizedFacts) {
      throw new Error("Nao foi possivel criticar decisao sem draft e fatos.");
    }

    return {
      decisionCritique: critiqueResultSchema.parse(
        await critiqueDecision(state.decisionDraft, state.normalizedFacts)
      )
    };
  });
}

async function finalizeDecisionNode(
  state: CaseDecisionState
): Promise<Partial<CaseDecisionState>> {
  return runNode("finalizeDecision", state, async () => {
    if (
      !state.activePolicy ||
      !state.caseRecord ||
      !state.normalizedFacts ||
      !state.riskScore ||
      !state.decisionDraft ||
      !state.decisionCritique
    ) {
      throw new Error("Estado insuficiente para consolidar decisao final.");
    }

    return {
      finalDecision: caseDecisionSchema.parse(
        finalizeCaseDecision(
          state.activePolicy,
          state.caseRecord,
          state.normalizedFacts,
          state.riskScore,
          state.decisionDraft,
          state.decisionCritique
        )
      )
    };
  });
}

async function explainForLawyerNode(
  state: CaseDecisionState
): Promise<Partial<CaseDecisionState>> {
  return runNode("explainForLawyer", state, async () => {
    if (
      !state.finalDecision ||
      !state.normalizedFacts ||
      !state.similarCases ||
      !state.riskScore ||
      !state.decisionCritique
    ) {
      throw new Error("Estado insuficiente para gerar explicacao ao advogado.");
    }

    return {
      lawyerExplanation: await explainForLawyer({
        decision: state.finalDecision,
        facts: state.normalizedFacts,
        similarCases: state.similarCases,
        risk: state.riskScore,
        critique: state.decisionCritique
      })
    };
  });
}

async function persistDecisionNode(
  state: CaseDecisionState
): Promise<Partial<CaseDecisionState>> {
  return runNode("persistDecision", state, async () => {
    if (
      !state.finalDecision ||
      !state.normalizedFacts ||
      !state.riskScore ||
      !state.activePolicy
    ) {
      throw new Error("Estado insuficiente para persistir analise.");
    }

    const { analysisId } = await persistCaseAnalysis({
      caseId: state.caseId,
      policyVersion: state.activePolicy.version,
      facts: state.normalizedFacts,
      factsCritique: state.extractedFactsCritique,
      contradictions: state.extractedFactsCritique
        ? {
            issues: state.extractedFactsCritique.issues,
            severity: state.extractedFactsCritique.severity
          }
        : undefined,
      similarCases: state.similarCases,
      risk: state.riskScore,
      decisionDraft: state.decisionDraft,
      decisionCritique: state.decisionCritique,
      decision: state.finalDecision,
      explanationText: state.lawyerExplanation
    });

    return {
      analysisId
    };
  });
}

export const caseDecisionGraph = new StateGraph(caseDecisionState)
  .addNode("ingestCase", ingestCaseNode)
  .addNode("extractFactsAction", extractFactsActionNode)
  .addNode("extractFactsCritique", extractFactsCritiqueNode)
  .addNode("finalizeFacts", finalizeFactsNode)
  .addNode("retrieveSimilarCases", retrieveSimilarCasesNode)
  .addNode("scoreRisk", scoreRiskNode)
  .addNode("proposeDecisionAction", proposeDecisionActionNode)
  .addNode("critiqueDecision", critiqueDecisionNode)
  .addNode("finalizeDecision", finalizeDecisionNode)
  .addNode("explainForLawyer", explainForLawyerNode)
  .addNode("persistDecision", persistDecisionNode)
  .addEdge(START, "ingestCase")
  .addEdge("ingestCase", "extractFactsAction")
  .addEdge("extractFactsAction", "extractFactsCritique")
  .addEdge("extractFactsCritique", "finalizeFacts")
  .addEdge("finalizeFacts", "retrieveSimilarCases")
  .addEdge("retrieveSimilarCases", "scoreRisk")
  .addEdge("scoreRisk", "proposeDecisionAction")
  .addEdge("proposeDecisionAction", "critiqueDecision")
  .addEdge("critiqueDecision", "finalizeDecision")
  .addEdge("finalizeDecision", "explainForLawyer")
  .addEdge("explainForLawyer", "persistDecision")
  .addEdge("persistDecision", END)
  .compile();

export async function runCaseDecision(input: {
  caseId: string;
  policyVersion?: string;
}): Promise<CaseDecisionState> {
  return caseDecisionGraph.invoke({
    caseId: input.caseId,
    policyVersion: input.policyVersion ?? "",
    documents: [],
    rawTextByDocType: {},
    errors: []
  });
}
