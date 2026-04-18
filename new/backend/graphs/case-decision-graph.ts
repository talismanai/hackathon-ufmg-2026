import { Annotation, END, START, StateGraph, addMessages } from "@langchain/langgraph";
import {
  AIMessage,
  isAIMessage,
  isToolMessage,
  type BaseMessage
} from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
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
import { planDecisionToolResearch } from "../agents/plan-decision-tool-research.js";
import { proposeDecisionAction } from "../agents/propose-decision-action.js";
import { env } from "../config/env.js";
import { createAgentRun } from "../db/repositories/agent-run-repository.js";
import { persistCaseAnalysis } from "../db/repositories/case-repository.js";
import {
  finalizeExtractedFacts,
  finalizeCaseDecision
} from "../lib/case-decision.js";
import { ingestCase } from "../services/case-decision/ingest-case.js";
import { retrieveSimilarCases } from "../services/case-decision/retrieve-similar-cases.js";
import { scoreCaseRisk } from "../services/case-decision/score-risk.js";
import { caseDecisionTools } from "../tools/case-decision-tools.js";

type GraphCaseDecisionState = CaseDecisionState & {
  messages: BaseMessage[];
  toolResearch?: Record<string, unknown>;
};

const caseDecisionToolNode = new ToolNode(caseDecisionTools);

function parseToolContent(content: unknown): unknown {
  if (typeof content === "string") {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }

  return content;
}

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
  messages: Annotation<BaseMessage[]>({
    reducer: addMessages,
    default: () => []
  }),
  toolResearch: Annotation<Record<string, unknown> | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  errors: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => []
  })
});

async function runNode<TDelta extends Partial<GraphCaseDecisionState>>(
  agentName: string,
  state: GraphCaseDecisionState,
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
      policyVersion: state.policyVersion || undefined,
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
      policyVersion: state.policyVersion || undefined,
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
  state: GraphCaseDecisionState
): Promise<Partial<GraphCaseDecisionState>> {
  return runNode("ingestCase", state, async () =>
    ingestCase(state.caseId, state.policyVersion || undefined)
  );
}

async function extractFactsActionNode(
  state: GraphCaseDecisionState
): Promise<Partial<GraphCaseDecisionState>> {
  return runNode("extractFactsAction", state, async () => ({
    extractedFactsDraft: extractedFactsSchema.parse(
      await extractFactsAction(state.documents, {
        workflowType: CASE_DECISION_WORKFLOW,
        agentName: "extractFactsAction",
        caseId: state.caseId,
        policyVersion: state.policyVersion || undefined
      })
    )
  }));
}

async function extractFactsCritiqueNode(
  state: GraphCaseDecisionState
): Promise<Partial<GraphCaseDecisionState>> {
  return runNode("extractFactsCritique", state, async () => ({
    extractedFactsCritique: critiqueResultSchema.parse(
      await extractFactsCritique(
        state.extractedFactsDraft ??
          (() => {
            throw new Error("Nao foi possivel criticar fatos sem o draft inicial.");
          })(),
        state.documents,
        {
          workflowType: CASE_DECISION_WORKFLOW,
          agentName: "extractFactsCritique",
          caseId: state.caseId,
          policyVersion: state.policyVersion || undefined
        }
      )
    )
  }));
}

async function finalizeFactsNode(
  state: GraphCaseDecisionState
): Promise<Partial<GraphCaseDecisionState>> {
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
  state: GraphCaseDecisionState
): Promise<Partial<GraphCaseDecisionState>> {
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
  state: GraphCaseDecisionState
): Promise<Partial<GraphCaseDecisionState>> {
  return runNode("scoreRisk", state, async () => {
    if (!state.similarCases) {
      throw new Error("Nao foi possivel calcular risco sem casos similares.");
    }

    return {
      riskScore: riskScoreSchema.parse(scoreCaseRisk(state.similarCases))
    };
  });
}

async function planDecisionToolResearchNode(
  state: GraphCaseDecisionState
): Promise<Partial<GraphCaseDecisionState>> {
  return runNode("planDecisionToolResearch", state, async () => {
    if (
      !state.caseRecord ||
      !state.activePolicy ||
      !state.normalizedFacts ||
      !state.similarCases ||
      !state.riskScore
    ) {
      throw new Error("Estado insuficiente para planejar consultas com tools.");
    }

    const response = await planDecisionToolResearch(
      {
        caseId: state.caseId,
        policyVersion: state.policyVersion,
        caseRecord: {
          id: state.caseRecord.id,
          externalCaseNumber: state.caseRecord.externalCaseNumber,
          processType: state.caseRecord.processType,
          uf: state.caseRecord.uf,
          claimAmountCents: state.caseRecord.claimAmountCents,
          status: state.caseRecord.status
        },
        activePolicy: {
          version: state.activePolicy.version,
          name: state.activePolicy.name,
          status: state.activePolicy.status,
          minOffer: state.activePolicy.minOffer,
          maxOffer: state.activePolicy.maxOffer
        },
        facts: state.normalizedFacts,
        similarCases: state.similarCases,
        risk: state.riskScore
      },
      {
        workflowType: CASE_DECISION_WORKFLOW,
        agentName: "planDecisionToolResearch",
        caseId: state.caseId,
        policyVersion: state.policyVersion || undefined
      }
    );

    return {
      messages: [response]
    };
  });
}

async function executeDecisionResearchToolsNode(
  state: GraphCaseDecisionState
): Promise<Partial<GraphCaseDecisionState>> {
  return runNode("executeDecisionResearchTools", state, async () => {
    const toolResult = await caseDecisionToolNode.invoke({
      messages: state.messages
    });

    return {
      messages: toolResult.messages as BaseMessage[]
    };
  });
}

async function summarizeDecisionToolResearchNode(
  state: GraphCaseDecisionState
): Promise<Partial<GraphCaseDecisionState>> {
  return runNode("summarizeDecisionToolResearch", state, async () => {
    const aiMessages = state.messages.filter(isAIMessage);
    const toolMessages = state.messages.filter(isToolMessage);
    const requestedToolCalls = aiMessages.flatMap((message) =>
      (message.tool_calls ?? []).map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.name,
        args: toolCall.args
      }))
    );
    const toolResults = toolMessages.map((message) => ({
      name: message.name ?? "unknown_tool",
      toolCallId: message.tool_call_id,
      result: parseToolContent(message.content)
    }));

    return {
      toolResearch: {
        requestedToolCalls,
        toolResults
      }
    };
  });
}

async function proposeDecisionActionNode(
  state: GraphCaseDecisionState
): Promise<Partial<GraphCaseDecisionState>> {
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
          state.riskScore,
          state.similarCases,
          state.toolResearch,
          {
            workflowType: CASE_DECISION_WORKFLOW,
            agentName: "proposeDecisionAction",
            caseId: state.caseId,
            policyVersion: state.policyVersion || undefined
          }
        )
      )
    };
  });
}

async function critiqueDecisionNode(
  state: GraphCaseDecisionState
): Promise<Partial<GraphCaseDecisionState>> {
  return runNode("critiqueDecision", state, async () => {
    if (!state.decisionDraft || !state.normalizedFacts) {
      throw new Error("Nao foi possivel criticar decisao sem draft e fatos.");
    }

    return {
      decisionCritique: critiqueResultSchema.parse(
        await critiqueDecision(state.decisionDraft, state.normalizedFacts, {
          workflowType: CASE_DECISION_WORKFLOW,
          agentName: "critiqueDecision",
          caseId: state.caseId,
          policyVersion: state.policyVersion || undefined
        })
      )
    };
  });
}

async function finalizeDecisionNode(
  state: GraphCaseDecisionState
): Promise<Partial<GraphCaseDecisionState>> {
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
  state: GraphCaseDecisionState
): Promise<Partial<GraphCaseDecisionState>> {
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
      }, {
        workflowType: CASE_DECISION_WORKFLOW,
        agentName: "explainForLawyer",
        caseId: state.caseId,
        policyVersion: state.policyVersion || undefined
      })
    };
  });
}

async function persistDecisionNode(
  state: GraphCaseDecisionState
): Promise<Partial<GraphCaseDecisionState>> {
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
  .addNode("planDecisionToolResearch", planDecisionToolResearchNode)
  .addNode("executeDecisionResearchTools", executeDecisionResearchToolsNode)
  .addNode("summarizeDecisionToolResearch", summarizeDecisionToolResearchNode)
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
  .addConditionalEdges("scoreRisk", () => {
    if (env.workflow2FastMode) {
      return "proposeDecisionAction";
    }

    return "planDecisionToolResearch";
  })
  .addConditionalEdges("planDecisionToolResearch", (state) => {
    const lastMessage = state.messages[state.messages.length - 1];

    if (lastMessage && isAIMessage(lastMessage) && (lastMessage.tool_calls?.length ?? 0) > 0) {
      return "executeDecisionResearchTools";
    }

    return "summarizeDecisionToolResearch";
  })
  .addEdge("executeDecisionResearchTools", "summarizeDecisionToolResearch")
  .addEdge("summarizeDecisionToolResearch", "proposeDecisionAction")
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
  return caseDecisionGraph.invoke(
    {
      caseId: input.caseId,
      policyVersion: input.policyVersion ?? "",
      documents: [],
      rawTextByDocType: {},
      messages: [],
      errors: []
    },
    {
      recursionLimit: 100
    }
  );
}
