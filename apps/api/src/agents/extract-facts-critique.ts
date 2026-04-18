import type { CaseDocument, CritiqueResult, ExtractedFacts } from "@grupo4/shared";
import { critiqueResultSchema } from "@grupo4/shared";

import type { AgentTraceContext } from "../lib/agent-transcript.js";
import { env } from "../config/env.js";
import { critiqueExtractedFacts } from "../lib/case-decision.js";
import { invokeStructuredWithFallback } from "../lib/llm.js";
import { extractFactsCritiquePrompt } from "../prompts/case-decision.js";

export async function extractFactsCritique(
  facts: ExtractedFacts,
  documents: CaseDocument[],
  trace?: AgentTraceContext
): Promise<CritiqueResult> {
  if (env.workflow2FastMode) {
    return critiqueResultSchema.parse(critiqueExtractedFacts(facts, documents));
  }

  return invokeStructuredWithFallback({
    systemPrompt: extractFactsCritiquePrompt,
    userPrompt: [
      "Revise os fatos extraidos e aponte inconsistencias.",
      `Fatos:\n${JSON.stringify(facts, null, 2)}`,
      `Documentos:\n${JSON.stringify(documents, null, 2)}`
    ].join("\n\n"),
    schema: critiqueResultSchema,
    trace,
    fallback: () => critiqueExtractedFacts(facts, documents)
  });
}
