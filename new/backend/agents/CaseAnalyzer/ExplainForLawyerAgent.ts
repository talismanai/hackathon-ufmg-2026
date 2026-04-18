import type {
  CaseDecision,
  CritiqueResult,
  ExtractedFacts,
  RiskScore,
  SimilarCasesSummary
} from "@grupo4/shared";

import type { AgentTraceContext } from "../../lib/agent-transcript.js";
import { explainForLawyer as explainForLawyerFromLegacy } from "../explain-for-lawyer.js";

export class ExplainForLawyerAgent {
  async explain(input: {
    decision: CaseDecision;
    facts: ExtractedFacts;
    similarCases: SimilarCasesSummary;
    risk: RiskScore;
    critique: CritiqueResult;
  }, trace?: AgentTraceContext): Promise<string> {
    return explainForLawyerFromLegacy(input, trace);
  }
}
