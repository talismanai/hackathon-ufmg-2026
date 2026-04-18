import {
  DEFAULT_POLICY_MAX_OFFER,
  DEFAULT_POLICY_MIN_OFFER,
  DEFAULT_POLICY_NAME,
  OFFER_FACTORS_BY_RISK_BAND,
  publishedPolicySchema,
  type PolicyCalibrationState,
  type PublishedPolicy
} from "@grupo4/shared";

import {
  publishPolicy
} from "../../db/repositories/policy-repository.js";

function buildVersion(): string {
  const now = new Date();
  const compact = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  return `policy-${compact}`;
}

function mostCommonProcessType(state: PolicyCalibrationState): string | null {
  const counts = new Map<string, number>();

  for (const row of state.historicalRows) {
    if (!row.processType) {
      continue;
    }

    counts.set(row.processType, (counts.get(row.processType) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

export async function publishPolicyVersion(
  state: PolicyCalibrationState
): Promise<PublishedPolicy> {
  if (!state.scorecard) {
    throw new Error("Nao e possivel publicar policy sem scorecard.");
  }

  const version = buildVersion();

  const { policyId, createdAt } = await publishPolicy({
    version,
    name: DEFAULT_POLICY_NAME,
    processType: mostCommonProcessType(state),
    minOffer: DEFAULT_POLICY_MIN_OFFER,
    maxOffer: DEFAULT_POLICY_MAX_OFFER,
    config: {
      runId: state.runId,
      generatedAt: new Date().toISOString(),
      inputCsvPath: state.inputCsvPath ?? null,
      logsPath: state.logsPath ?? null,
      calibrationAttempt: state.calibrationAttempt,
      critiqueReport: state.critiqueReport ?? null,
      bucketCount: state.featureBuckets.length,
      datasetSplit: state.datasetSplit ?? null,
      lawyerSummary: state.policyLawyerSummary ?? null,
      offerFactorsByRiskBand: OFFER_FACTORS_BY_RISK_BAND,
      limitations: [
        "A calibracao offline usa presenca de subsidios como proxy e ainda nao enxerga matchingDepositFound nem creditProofValid.",
        "Quando o historico vem direto do CSV, o enriquecimento documental fica reduzido."
      ]
    },
    rules: state.candidateRules,
    scorecard: state.scorecard
  });

  return publishedPolicySchema.parse({
    policyId,
    version,
    status: "published",
    rules: state.candidateRules,
    scorecard: state.scorecard,
    lawyerSummary: state.policyLawyerSummary,
    datasetSplit: state.datasetSplit,
    createdAt: createdAt.toISOString()
  });
}
