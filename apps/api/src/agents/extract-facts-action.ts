import type { CaseDocument, ExtractedFacts } from "@grupo4/shared";

import { extractFactsFromDocuments } from "../lib/case-decision.js";

export async function extractFactsAction(
  documents: CaseDocument[]
): Promise<ExtractedFacts> {
  return extractFactsFromDocuments(documents);
}
