import type { PolicyCalibrationState } from "@grupo4/shared";

import type { AgentTraceContext } from "../../lib/agent-transcript.js";
import { explainPolicyForLawyer as explainPolicyForLawyerFromLegacy } from "../explain-policy-for-lawyer.js";

export class PolicyExplainForLawyerAgent {
  async explain(
    state: Pick<
      PolicyCalibrationState,
      "candidateRules" | "scorecard" | "datasetSplit" | "calibrationAttempt"
    >,
    trace?: AgentTraceContext
  ): Promise<string> {
    return explainPolicyForLawyerFromLegacy(state, trace);
  }
}
