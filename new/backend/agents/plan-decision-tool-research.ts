import { AIMessage } from "@langchain/core/messages";
import type {
  CaseRecord,
  ExtractedFacts,
  RiskScore,
  SimilarCasesSummary,
  StoredPolicy
} from "@grupo4/shared";

import type { AgentTraceContext } from "../lib/agent-transcript.js";
import { invokeToolCallingWithFallback } from "../lib/llm.js";
import { planDecisionToolResearchPrompt } from "../prompts/case-decision.js";
import { caseDecisionTools } from "../tools/case-decision-tools.js";

function buildDefaultToolRequest(caseId: string, policyVersion: string): AIMessage {
  return new AIMessage({
    content:
      "Vou confirmar o caso, a policy vigente e o historico similar diretamente no banco antes de propor a decisao.",
    tool_calls: [
      {
        id: "call_case_snapshot",
        name: "get_case_snapshot",
        args: {
          caseId
        }
      },
      {
        id: "call_policy_snapshot",
        name: "get_policy_snapshot",
        args: {
          selection: "by_version",
          policyVersion
        }
      },
      {
        id: "call_similar_cases_snapshot",
        name: "get_similar_cases_snapshot",
        args: {
          caseId
        }
      }
    ]
  });
}

export async function planDecisionToolResearch(input: {
  caseId: string;
  policyVersion: string;
  caseRecord: Pick<
    CaseRecord,
    "id" | "externalCaseNumber" | "processType" | "uf" | "claimAmountCents" | "status"
  >;
  activePolicy: Pick<StoredPolicy, "version" | "name" | "status" | "minOffer" | "maxOffer">;
  facts: ExtractedFacts;
  similarCases: SimilarCasesSummary;
  risk: RiskScore;
}, trace?: AgentTraceContext): Promise<AIMessage> {
  const response = await invokeToolCallingWithFallback({
    systemPrompt: planDecisionToolResearchPrompt,
    userPrompt: [
      "Avalie se vale consultar tools antes de propor a decisao.",
      "Voce deve consultar pelo menos o snapshot do caso e da policy se quiser confirmar dados diretamente no banco.",
      `Estado atual:\n${JSON.stringify(input, null, 2)}`
    ].join("\n\n"),
    tools: caseDecisionTools,
    trace,
    fallback: () => buildDefaultToolRequest(input.caseId, input.policyVersion)
  });

  if ((response.tool_calls?.length ?? 0) === 0) {
    return buildDefaultToolRequest(input.caseId, input.policyVersion);
  }

  return response;
}
