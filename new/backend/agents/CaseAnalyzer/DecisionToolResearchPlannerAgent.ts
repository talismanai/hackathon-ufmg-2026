import type { AIMessage } from "@langchain/core/messages";
import type {
  CaseRecord,
  ExtractedFacts,
  RiskScore,
  SimilarCasesSummary,
  StoredPolicy
} from "@grupo4/shared";

import type { AgentTraceContext } from "../../lib/agent-transcript.js";
import { planDecisionToolResearch as planDecisionToolResearchFromLegacy } from "../plan-decision-tool-research.js";

export class DecisionToolResearchPlannerAgent {
  async plan(input: {
    caseId: string;
    policyVersion: string;
    caseRecord: Pick<
      CaseRecord,
      "id" | "externalCaseNumber" | "processType" | "uf" | "claimAmountCents" | "status"
    >;
    activePolicy: Pick<
      StoredPolicy,
      "version" | "name" | "status" | "minOffer" | "maxOffer"
    >;
    facts: ExtractedFacts;
    similarCases: SimilarCasesSummary;
    risk: RiskScore;
    trace?: AgentTraceContext;
  }): Promise<AIMessage> {
    return planDecisionToolResearchFromLegacy(
      {
        caseId: input.caseId,
        policyVersion: input.policyVersion,
        caseRecord: input.caseRecord,
        activePolicy: input.activePolicy,
        facts: input.facts,
        similarCases: input.similarCases,
        risk: input.risk
      },
      input.trace
    );
  }
}
