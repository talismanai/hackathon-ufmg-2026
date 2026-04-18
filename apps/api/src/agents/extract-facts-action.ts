import type { CaseDocument, ExtractedFacts } from "@grupo4/shared";
import { extractedFactsSchema } from "@grupo4/shared";

import type { AgentTraceContext } from "../lib/agent-transcript.js";
import { env } from "../config/env.js";
import { extractFactsFromDocuments } from "../lib/case-decision.js";
import { invokeStructuredWithFallback } from "../lib/llm.js";
import { extractFactsActionPrompt } from "../prompts/case-decision.js";

export async function extractFactsAction(
  documents: CaseDocument[],
  trace?: AgentTraceContext
): Promise<ExtractedFacts> {
  if (env.workflow2FastMode) {
    return extractedFactsSchema.parse(extractFactsFromDocuments(documents));
  }

  return invokeStructuredWithFallback({
    systemPrompt: extractFactsActionPrompt,
    userPrompt: [
      "Extraia os fatos relevantes dos documentos abaixo.",
      JSON.stringify(documents, null, 2),
      "Referencia heuristica inicial:",
      JSON.stringify(extractFactsFromDocuments(documents), null, 2)
    ].join("\n\n"),
    schema: extractedFactsSchema,
    trace,
    fallback: () => extractFactsFromDocuments(documents)
  });
}
