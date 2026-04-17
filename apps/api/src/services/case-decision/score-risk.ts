import type { SimilarCasesSummary } from "@grupo4/shared";

import { scoreRisk } from "../../lib/case-decision.js";

export function scoreCaseRisk(similarCases: SimilarCasesSummary) {
  return scoreRisk(similarCases);
}
