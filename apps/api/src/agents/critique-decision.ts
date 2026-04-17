import type { CritiqueResult, DecisionDraft, ExtractedFacts } from "@grupo4/shared";

import { critiqueDecisionDraft } from "../lib/case-decision.js";

export async function critiqueDecision(
  draft: DecisionDraft,
  facts: ExtractedFacts
): Promise<CritiqueResult> {
  return critiqueDecisionDraft(draft, facts);
}
