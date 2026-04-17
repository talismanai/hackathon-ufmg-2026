import type { CaseDocument, CritiqueResult, ExtractedFacts } from "@grupo4/shared";

import { critiqueExtractedFacts } from "../lib/case-decision.js";

export async function extractFactsCritique(
  facts: ExtractedFacts,
  documents: CaseDocument[]
): Promise<CritiqueResult> {
  return critiqueExtractedFacts(facts, documents);
}
