import test from "node:test";
import assert from "node:assert/strict";

import { critiquePolicyRules } from "./critique-policy-rules.js";
import { proposePolicyRules } from "./propose-policy-rules.js";
import { scorePolicyRules } from "../services/policy-calibration/score-policy-rules.js";
import {
  makeBucket,
  makeHistoricalRow
} from "../test-helpers/policy-fixtures.js";

test("proposePolicyRules gera regras de acordo, defesa e review quando os buckets permitem", async () => {
  const buckets = [
    makeBucket({
      bucketKey: "agreement-bucket",
      sampleSize: 60,
      lossRate: 0.92,
      expectedJudicialCost: 9000,
      featureSnapshot: {
        contractPresent: false,
        creditProofPresent: false,
        dossierPresent: false,
        debtEvolutionPresent: false,
        referenceReportPresent: false,
        hasFullDocumentation: false,
        subsidyCount: 0,
        claimAmountBand: "high"
      }
    }),
    makeBucket({
      bucketKey: "defense-bucket",
      sampleSize: 55,
      lossRate: 0.08,
      expectedJudicialCost: 300,
      featureSnapshot: {
        hasFullDocumentation: true,
        claimAmountBand: "medium"
      }
    }),
    makeBucket({
      bucketKey: "review-bucket",
      sampleSize: 30,
      lossRate: 0.5,
      expectedJudicialCost: 2500,
      featureSnapshot: {
        contractPresent: false,
        creditProofPresent: true,
        hasFullDocumentation: false,
        claimAmountBand: "low"
      }
    })
  ];

  const rules = await proposePolicyRules(buckets);

  assert.ok(rules.some((rule) => rule.action === "agreement"));
  assert.ok(rules.some((rule) => rule.action === "defense"));
  assert.ok(rules.some((rule) => rule.action === "review"));

  const agreementRule = rules.find((rule) => rule.action === "agreement");
  assert.ok(agreementRule?.offerTargetFactor);
});

test("critiquePolicyRules marca conflito de condicoes com acoes diferentes", async () => {
  const conflictingConditions = [
    { field: "contractPresent", operator: "eq" as const, value: true }
  ];

  const report = await critiquePolicyRules([
    {
      ruleKey: "rule_a",
      priority: 10,
      title: "A",
      conditionSummary: "A",
      conditionJson: { all: conflictingConditions },
      action: "agreement",
      offerTargetFactor: 0.5,
      explanation: "A"
    },
    {
      ruleKey: "rule_b",
      priority: 20,
      title: "B",
      conditionSummary: "B",
      conditionJson: { all: conflictingConditions },
      action: "defense",
      explanation: "B"
    }
  ]);

  assert.equal(report.passed, false);
  assert.ok(
    report.issues.some((issue) =>
      issue.message.includes("Mesmo conjunto de condicoes aparece com acoes diferentes.")
    )
  );
});

test("scorePolicyRules calcula cobertura e economia com base na regra aplicada", () => {
  const rowForAgreement = makeHistoricalRow({
    caseNumber: "agreement-case",
    outcome: "Não Êxito",
    condemnationValueBrl: 10000,
    features: {
      contractPresent: false,
      creditProofPresent: false,
      dossierPresent: false,
      debtEvolutionPresent: false,
      referenceReportPresent: false,
      claimAmountBand: "high",
      hasFullDocumentation: false,
      subsidyCount: 0
    }
  });
  const rowForFallbackDefense = makeHistoricalRow({
    caseNumber: "defense-case",
    outcome: "Êxito",
    condemnationValueBrl: 0,
    features: {
      claimAmountBand: "low"
    }
  });
  const agreementBucket = makeBucket({
    bucketKey:
      "contract:0|credit:0|dossier:0|debt:0|report:0|band:high|full:0",
    sampleSize: 60,
    lossRate: 0.9,
    medianCondemnationBrl: 10000,
    expectedJudicialCost: 9000,
    featureSnapshot: rowForAgreement.features
  });
  const defenseBucket = makeBucket({
    bucketKey:
      "contract:1|credit:1|dossier:1|debt:1|report:1|band:low|full:1",
    sampleSize: 60,
    lossRate: 0.05,
    medianCondemnationBrl: 1000,
    expectedJudicialCost: 50,
    featureSnapshot: rowForFallbackDefense.features
  });
  const rules = [
    {
      ruleKey: "agreement_rule",
      priority: 10,
      title: "Agreement",
      conditionSummary: "Agreement",
      conditionJson: {
        all: [
          { field: "contractPresent", operator: "eq" as const, value: false },
          { field: "creditProofPresent", operator: "eq" as const, value: false },
          { field: "claimAmountBand", operator: "eq" as const, value: "high" }
        ]
      },
      action: "agreement" as const,
      offerMinFactor: 0.5525,
      offerTargetFactor: 0.65,
      offerMaxFactor: 0.7475,
      explanation: "Agreement"
    }
  ];

  const scorecard = scorePolicyRules(
    [rowForAgreement, rowForFallbackDefense],
    [agreementBucket, defenseBucket],
    rules
  );

  assert.equal(scorecard.totalCases, 2);
  assert.equal(scorecard.trainSampleSize, 120);
  assert.equal(scorecard.testSampleSize, 2);
  assert.equal(scorecard.matchedCases, 1);
  assert.equal(scorecard.coverageRate, 0.5);
  assert.equal(scorecard.policyScore, 1);
  assert.equal(scorecard.agreementRate, 0.5);
  assert.equal(scorecard.defenseRate, 0.5);
  assert.equal(scorecard.reviewRate, 0);
  assert.equal(scorecard.baselineExpectedCost, 9050);
  assert.equal(scorecard.estimatedPolicyCost, 6550);
  assert.equal(scorecard.estimatedSavings, 2500);
});
