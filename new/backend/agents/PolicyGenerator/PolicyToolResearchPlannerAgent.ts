import type { AIMessage } from "@langchain/core/messages";
import type {
  DatasetSplitSummary,
  FeatureBucket,
  HistoricalCaseRow,
  PolicyRuleDraft
} from "@grupo4/shared";

import type { AgentTraceContext } from "../../lib/agent-transcript.js";
import { planPolicyToolResearch as planPolicyToolResearchFromLegacy } from "../plan-policy-tool-research.js";

export class PolicyToolResearchPlannerAgent {
  async plan(input: {
    runId: string;
    calibrationAttempt: number;
    datasetSplit?: DatasetSplitSummary;
    historicalRows: HistoricalCaseRow[];
    featureBuckets: FeatureBucket[];
    candidateRules?: PolicyRuleDraft[];
    trace?: AgentTraceContext;
  }): Promise<AIMessage> {
    return planPolicyToolResearchFromLegacy(
      {
        runId: input.runId,
        calibrationAttempt: input.calibrationAttempt,
        datasetSplit: input.datasetSplit,
        historicalRows: input.historicalRows,
        featureBuckets: input.featureBuckets,
        candidateRules: input.candidateRules
      },
      input.trace
    );
  }
}
