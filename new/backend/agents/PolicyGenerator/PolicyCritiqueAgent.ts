import type { PolicyCalibrationState } from "@grupo4/shared";

export class PolicyCritiqueAgent {
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
