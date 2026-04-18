import type {
  CaseRecord,
  DecisionDraft,
  ExtractedFacts,
  RiskScore,
  SimilarCasesSummary,
  StoredPolicy
} from "@grupo4/shared";
import { decisionDraftSchema } from "@grupo4/shared";

import type { AgentTraceContext } from "../lib/agent-transcript.js";
import { env } from "../config/env.js";
import { proposeDecisionDraft } from "../lib/case-decision.js";
import {
  buildToolResearchPayload,
  executeToolCallsFromMessage,
  isOpenAIConfigured,
  invokeStructuredWithFallback
} from "../lib/llm.js";
import {
  planDecisionToolResearchPrompt,
  proposeDecisionActionPrompt
} from "../prompts/case-decision.js";
import { caseDecisionTools } from "../tools/case-decision-tools.js";
import { planDecisionToolResearch } from "./plan-decision-tool-research.js";

async function buildDecisionToolResearch(
  policy: StoredPolicy,
  caseRecord: Pick<
    CaseRecord,
    "id" | "externalCaseNumber" | "processType" | "uf" | "claimAmountCents" | "status"
  >,
  facts: ExtractedFacts,
  similarCases: SimilarCasesSummary | undefined,
  risk: RiskScore,
  trace?: AgentTraceContext
): Promise<Record<string, unknown>> {
  const planningMessage = await planDecisionToolResearch(
    {
      caseId: caseRecord.id,
      policyVersion: policy.version,
      caseRecord,
      activePolicy: {
        version: policy.version,
        name: policy.name,
        status: policy.status,
        minOffer: policy.minOffer,
        maxOffer: policy.maxOffer
      },
      facts,
      similarCases: similarCases ?? {
        sampleSize: 0,
        lossRate: risk.lossProbability,
        medianCondemnation: risk.expectedCondemnation,
        avgCondemnation: risk.expectedCondemnation,
        topPatterns: ["sem_historico_similar_informado"]
      },
      risk
    },
    trace
  );

  const executedToolCalls = await executeToolCallsFromMessage({
    message: planningMessage,
    tools: caseDecisionTools,
    trace,
    executionLabel: "propose_decision_action"
  });

  return buildToolResearchPayload(planningMessage, executedToolCalls);
}

export async function proposeDecisionAction(
  policy: StoredPolicy,
  caseRecord: Pick<
    CaseRecord,
    "id" | "externalCaseNumber" | "processType" | "uf" | "claimAmountCents" | "status"
  >,
  facts: ExtractedFacts,
  risk: RiskScore,
  similarCases: SimilarCasesSummary | undefined,
  toolResearch: Record<string, unknown> | undefined,
  trace?: AgentTraceContext
): Promise<DecisionDraft> {
  if (env.workflow2FastMode) {
    return decisionDraftSchema.parse(
      proposeDecisionDraft(policy, caseRecord, facts, risk)
    );
  }

  const hasPreloadedToolResearch =
    Boolean(toolResearch) &&
    typeof toolResearch === "object" &&
    Object.keys(toolResearch).length > 0;
  const agentToolResearch = isOpenAIConfigured() && !hasPreloadedToolResearch
    ? await buildDecisionToolResearch(
        policy,
        caseRecord,
        facts,
        similarCases,
        risk,
        trace
      )
    : {};
  const combinedToolResearch = {
    preloadedToolResearch: toolResearch ?? {},
    inAgentToolResearch: agentToolResearch
  };

  return invokeStructuredWithFallback({
    systemPrompt: proposeDecisionActionPrompt,
    userPrompt: [
      "Proponha a decisao inicial para o caso.",
      "Antes da resposta final, o agente executou um ciclo explicito de reason -> tool -> reason.",
      `Prompt do planejamento de pesquisa:\n${planDecisionToolResearchPrompt}`,
      `Policy ativa:\n${JSON.stringify(policy, null, 2)}`,
      `Caso:\n${JSON.stringify(caseRecord, null, 2)}`,
      `Fatos:\n${JSON.stringify(facts, null, 2)}`,
      `Risco:\n${JSON.stringify(risk, null, 2)}`,
      `Tool research combinado:\n${JSON.stringify(combinedToolResearch, null, 2)}`,
      "Referencia deterministica inicial:",
      JSON.stringify(proposeDecisionDraft(policy, caseRecord, facts, risk), null, 2)
    ].join("\n\n"),
    schema: decisionDraftSchema,
    trace,
    fallback: () => proposeDecisionDraft(policy, caseRecord, facts, risk)
  });
}
