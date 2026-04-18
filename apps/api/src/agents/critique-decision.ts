import type { CritiqueResult, DecisionDraft, ExtractedFacts } from "@grupo4/shared";
import { critiqueResultSchema } from "@grupo4/shared";

import type { AgentTraceContext } from "../lib/agent-transcript.js";
import { env } from "../config/env.js";
import { critiqueDecisionDraft } from "../lib/case-decision.js";
import { invokeStructuredWithFallback } from "../lib/llm.js";
import { critiqueDecisionPrompt } from "../prompts/case-decision.js";

export async function critiqueDecision(
  draft: DecisionDraft,
  facts: ExtractedFacts,
  trace?: AgentTraceContext
): Promise<CritiqueResult> {
  if (env.workflow2FastMode) {
    return critiqueResultSchema.parse(critiqueDecisionDraft(draft, facts));
  }

  return invokeStructuredWithFallback({
    systemPrompt: critiqueDecisionPrompt,
    userPrompt: [
      "Critique a decisao proposta sem criar uma nova do zero.",
      `Decision draft:\n${JSON.stringify(draft, null, 2)}`,
      `Fatos:\n${JSON.stringify(facts, null, 2)}`
    ].join("\n\n"),
    schema: critiqueResultSchema,
    trace,
    fallback: () => critiqueDecisionDraft(draft, facts)
  });
}
