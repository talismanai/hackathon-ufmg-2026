import type {
  CaseRecord,
  DecisionDraft,
  ExtractedFacts,
  RiskScore,
  SimilarCasesSummary,
  StoredPolicy
} from "@grupo4/shared";

import type { AgentTraceContext } from "../../lib/agent-transcript.js";
import { proposeDecisionAction as proposeDecisionActionFromLegacy } from "../propose-decision-action.js";

export class DecisionProposerAgent {
  async propose(input: {
    policy: StoredPolicy;
    caseRecord: Pick<
      CaseRecord,
      "id" | "externalCaseNumber" | "processType" | "uf" | "claimAmountCents" | "status"
    >;
    facts: ExtractedFacts;
    risk: RiskScore;
    similarCases?: SimilarCasesSummary;
    toolResearch?: Record<string, unknown>;
    trace?: AgentTraceContext;
  }): Promise<DecisionDraft> {
    return proposeDecisionActionFromLegacy(
      input.policy,
      input.caseRecord,
      input.facts,
      input.risk,
      input.similarCases,
      input.toolResearch,
      input.trace
    );
  }
}
