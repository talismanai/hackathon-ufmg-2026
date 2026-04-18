import type {
  CaseDecision,
  CritiqueResult,
  ExtractedFacts,
  RiskScore,
  SimilarCasesSummary
} from "@grupo4/shared";

import type { AgentTraceContext } from "../lib/agent-transcript.js";
import { env } from "../config/env.js";
import { explainDecisionForLawyer } from "../lib/case-decision.js";
import { invokeTextWithFallback } from "../lib/llm.js";
import { explainForLawyerPrompt } from "../prompts/case-decision.js";

export async function explainForLawyer(input: {
  decision: CaseDecision;
  facts: ExtractedFacts;
  similarCases: SimilarCasesSummary;
  risk: RiskScore;
  critique: CritiqueResult;
}, trace?: AgentTraceContext): Promise<string> {
  if (env.workflow2FastMode) {
    return explainDecisionForLawyer(input);
  }

  return invokeTextWithFallback({
    systemPrompt: explainForLawyerPrompt,
    userPrompt: JSON.stringify(input, null, 2),
    trace,
    fallback: () => explainDecisionForLawyer(input)
  });
}
