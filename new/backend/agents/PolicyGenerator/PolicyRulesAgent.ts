import type {
  DatasetSplitSummary,
  FeatureBucket,
  HistoricalCaseRow,
  PolicyRuleDraft
} from "@grupo4/shared";

import type { AgentTraceContext } from "../../lib/agent-transcript.js";
import { proposePolicyRules as proposePolicyRulesFromLegacy } from "../propose-policy-rules.js";

export class PolicyRulesAgent {
  async propose(input: {
    featureBuckets: FeatureBucket[];
    runId?: string;
    calibrationAttempt?: number;
    historicalRows?: HistoricalCaseRow[];
    datasetSplit?: DatasetSplitSummary;
    toolResearch?: Record<string, unknown>;
    trace?: AgentTraceContext;
  }): Promise<PolicyRuleDraft[]> {
    return proposePolicyRulesFromLegacy(input.featureBuckets, {
      runId: input.runId,
      calibrationAttempt: input.calibrationAttempt,
      historicalRows: input.historicalRows,
      datasetSplit: input.datasetSplit,
      toolResearch: input.toolResearch,
      trace: input.trace
    });
  }
}
