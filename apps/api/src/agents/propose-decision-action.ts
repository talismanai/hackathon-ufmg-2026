import type {
  CaseRecord,
  DecisionDraft,
  ExtractedFacts,
  RiskScore,
  StoredPolicy
} from "@grupo4/shared";

import { proposeDecisionDraft } from "../lib/case-decision.js";

export async function proposeDecisionAction(
  policy: StoredPolicy,
  caseRecord: Pick<CaseRecord, "claimAmountCents">,
  facts: ExtractedFacts,
  risk: RiskScore
): Promise<DecisionDraft> {
  return proposeDecisionDraft(policy, caseRecord, facts, risk);
}
