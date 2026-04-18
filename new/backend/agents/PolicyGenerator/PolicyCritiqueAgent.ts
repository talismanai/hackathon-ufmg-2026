import type {
  PolicyCalibrationState,
  PolicyCritiqueReport,
  PolicyRuleDraft
} from "@grupo4/shared";

import type { AgentTraceContext } from "../../lib/agent-transcript.js";
import { critiquePolicyRules as critiquePolicyRulesFromLegacy } from "../critique-policy-rules.js";

export class PolicyCritiqueAgent {
  async critiqueRules(
    rules: PolicyRuleDraft[],
    toolResearch?: Record<string, unknown>,
    trace?: AgentTraceContext
  ): Promise<PolicyCritiqueReport> {
    return critiquePolicyRulesFromLegacy(rules, toolResearch, trace);
  }

  summarizeCalibration(state: PolicyCalibrationState) {
    return {
      runId: state.runId,
      errors: state.errors,
      critiqueReport: state.critiqueReport,
      scorecard: state.scorecard,
      publishedPolicy: state.publishedPolicy
    };
  }
}
