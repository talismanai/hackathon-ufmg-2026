import type {
  CaseDecision,
  CritiqueResult,
  ExtractedFacts,
  RiskScore,
  SimilarCasesSummary
} from "@grupo4/shared";

import { explainDecisionForLawyer } from "../lib/case-decision.js";

export async function explainForLawyer(input: {
  decision: CaseDecision;
  facts: ExtractedFacts;
  similarCases: SimilarCasesSummary;
  risk: RiskScore;
  critique: CritiqueResult;
}): Promise<string> {
  return explainDecisionForLawyer(input);
}
