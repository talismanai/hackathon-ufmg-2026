import type {
  FeatureBucket,
  HistoricalCaseRow,
  PolicyRuleDraft,
  PolicyScorecard
} from "@grupo4/shared";
import { policyScorecardSchema } from "@grupo4/shared";

import {
  buildOfferRange,
  fallbackAction,
  isFavorableOutcome,
  matchesRule,
  riskBandFromLossProbability,
  toBucketKey
} from "../../lib/policy-calibration.js";

export function scorePolicyRules(
  historicalRows: HistoricalCaseRow[],
  featureBuckets: FeatureBucket[],
  candidateRules: PolicyRuleDraft[],
  trainingRowsCount = featureBuckets.reduce((sum, bucket) => sum + bucket.sampleSize, 0)
): PolicyScorecard {
  const bucketsByKey = new Map(
    featureBuckets.map((bucket) => [bucket.bucketKey, bucket])
  );
  const orderedRules = [...candidateRules].sort(
    (left, right) => left.priority - right.priority
  );
  const actionCounters = {
    agreement: 0,
    defense: 0,
    review: 0
  };
  let matchedCases = 0;
  let correctlyHandledCases = 0;
  let estimatedPolicyCost = 0;
  let baselineExpectedCost = 0;

  for (const row of historicalRows) {
    const bucket =
      bucketsByKey.get(toBucketKey(row.features)) ??
      ({
        bucketKey: "fallback",
        sampleSize: 1,
        lossRate: row.condemnationValueBrl > 0 ? 1 : 0,
        avgCondemnationBrl: row.condemnationValueBrl,
        medianCondemnationBrl: row.condemnationValueBrl,
        expectedJudicialCost: row.condemnationValueBrl,
        outcomeBreakdown: {
          [row.outcome]: 1
        },
        featureSnapshot: row.features
      } satisfies FeatureBucket);
    const matchedRule = orderedRules.find((rule) => matchesRule(row, rule));
    const fallback = fallbackAction(bucket);
    const finalAction = matchedRule?.action ?? fallback;
    const riskBand = riskBandFromLossProbability(bucket.lossRate);
    const offerRange = buildOfferRange(bucket.medianCondemnationBrl, riskBand);

    baselineExpectedCost += bucket.expectedJudicialCost;

    if (matchedRule) {
      matchedCases += 1;
    }

    actionCounters[finalAction] += 1;

    const expectedAction = isFavorableOutcome(row.outcome)
      ? "defense"
      : "agreement";
    if (finalAction === expectedAction) {
      correctlyHandledCases += 1;
    }

    if (finalAction === "agreement") {
      estimatedPolicyCost += offerRange.target;
    } else if (finalAction === "review") {
      estimatedPolicyCost += bucket.expectedJudicialCost;
    } else {
      estimatedPolicyCost += bucket.expectedJudicialCost;
    }
  }

  const totalCases = historicalRows.length || 1;

  return policyScorecardSchema.parse({
    totalCases: historicalRows.length,
    trainSampleSize: trainingRowsCount,
    testSampleSize: historicalRows.length,
    matchedCases,
    coverageRate: matchedCases / totalCases,
    estimatedPolicyCost,
    baselineExpectedCost,
    estimatedSavings: baselineExpectedCost - estimatedPolicyCost,
    policyScore: correctlyHandledCases / totalCases,
    agreementRate: actionCounters.agreement / totalCases,
    defenseRate: actionCounters.defense / totalCases,
    reviewRate: actionCounters.review / totalCases,
    hardRuleHitRate: matchedCases / totalCases
  });
}
