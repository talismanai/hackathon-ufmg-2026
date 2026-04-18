import {
  type DatasetSplitSummary,
  MIN_BUCKET_SAMPLE_SIZE,
  OFFER_FACTORS_BY_RISK_BAND,
  type FeatureBucket,
  type HistoricalCaseRow,
  type PolicyRuleDraft
} from "@grupo4/shared";
import { policyRuleDraftSchema } from "@grupo4/shared";
import { z } from "zod";

import {
  bucketSummaryFromFeatures,
  buildRuleConditions,
  riskBandFromLossProbability
} from "../lib/policy-calibration.js";
import type { AgentTraceContext } from "../lib/agent-transcript.js";
import {
  buildToolResearchPayload,
  executeToolCallsFromMessage,
  isOpenAIConfigured,
  invokeStructuredWithFallback
} from "../lib/llm.js";
import {
  planPolicyToolResearchPrompt,
  proposePolicyRulesPrompt
} from "../prompts/policy-calibration.js";
import { policyCalibrationTools } from "../tools/policy-calibration-tools.js";
import { planPolicyToolResearch } from "./plan-policy-tool-research.js";

const policyRulesResponseSchema = z.object({
  rules: z.array(policyRuleDraftSchema).min(1)
});

function buildRule(
  bucket: FeatureBucket,
  action: "agreement" | "defense" | "review",
  priority: number
): PolicyRuleDraft {
  const riskBand = riskBandFromLossProbability(bucket.lossRate);
  const offerFactors = OFFER_FACTORS_BY_RISK_BAND[riskBand];
  const conditionJson = buildRuleConditions(bucket.featureSnapshot);

  conditionJson.bucketKey = bucket.bucketKey;
  conditionJson.sampleSize = bucket.sampleSize;
  conditionJson.lossRate = bucket.lossRate;

  return policyRuleDraftSchema.parse({
    ruleKey: `${action}_${bucket.bucketKey.replace(/\|/g, "_")}`,
    priority,
    title:
      action === "agreement"
        ? `Acordo para bucket ${bucket.bucketKey}`
        : action === "defense"
          ? `Defesa para bucket ${bucket.bucketKey}`
          : `Revisao para bucket ${bucket.bucketKey}`,
    conditionSummary: bucketSummaryFromFeatures(bucket.featureSnapshot),
    conditionJson,
    action,
    offerMinFactor: action === "agreement" ? offerFactors.min : undefined,
    offerTargetFactor: action === "agreement" ? offerFactors.target : undefined,
    offerMaxFactor: action === "agreement" ? offerFactors.max : undefined,
    explanation:
      action === "agreement"
        ? `Bucket com ${bucket.sampleSize} casos, loss rate de ${(bucket.lossRate * 100).toFixed(1)}% e custo judicial esperado de R$ ${bucket.expectedJudicialCost.toFixed(2)}.`
        : action === "defense"
          ? `Bucket com historico favoravel ao banco, ${bucket.sampleSize} casos e loss rate de ${(bucket.lossRate * 100).toFixed(1)}%.`
          : `Bucket com ambiguidade estatistica; requer revisao humana apesar de ${bucket.sampleSize} casos observados.`
  });
}

async function proposePolicyRulesDeterministically(
  featureBuckets: FeatureBucket[],
  options?: {
    calibrationAttempt?: number;
  }
): Promise<PolicyRuleDraft[]> {
  const calibrationAttempt = options?.calibrationAttempt ?? 1;
  const minimumBucketSampleSize =
    calibrationAttempt === 1 ? MIN_BUCKET_SAMPLE_SIZE : calibrationAttempt === 2 ? 18 : 12;
  const agreementLossThreshold =
    calibrationAttempt === 1 ? 0.58 : calibrationAttempt === 2 ? 0.5 : 0.45;
  const defenseLossThreshold =
    calibrationAttempt === 1 ? 0.25 : calibrationAttempt === 2 ? 0.3 : 0.35;
  const maxAgreementRules = calibrationAttempt === 1 ? 4 : calibrationAttempt === 2 ? 5 : 6;
  const maxDefenseRules = calibrationAttempt === 1 ? 3 : calibrationAttempt === 2 ? 4 : 5;
  const maxReviewRules = calibrationAttempt === 1 ? 1 : 2;
  const eligibleBuckets = featureBuckets.filter(
    (bucket) => bucket.sampleSize >= minimumBucketSampleSize
  );

  const agreementRules = eligibleBuckets
    .filter((bucket) => bucket.lossRate >= agreementLossThreshold)
    .sort(
      (left, right) =>
        right.expectedJudicialCost - left.expectedJudicialCost ||
        right.lossRate - left.lossRate ||
        right.sampleSize - left.sampleSize
    )
    .slice(0, maxAgreementRules);

  const defenseRules = eligibleBuckets
    .filter(
      (bucket) =>
        bucket.lossRate <= defenseLossThreshold &&
        bucket.featureSnapshot.hasFullDocumentation
    )
    .sort(
      (left, right) =>
        left.lossRate - right.lossRate || right.sampleSize - left.sampleSize
    )
    .slice(0, maxDefenseRules);

  const reviewRules = eligibleBuckets
    .filter(
      (bucket) =>
        bucket.lossRate > defenseLossThreshold &&
        bucket.lossRate < agreementLossThreshold &&
        bucket.sampleSize < 60
    )
    .sort((left, right) => right.sampleSize - left.sampleSize)
    .slice(0, maxReviewRules);

  const rules: PolicyRuleDraft[] = [];
  let priority = 10;

  for (const bucket of agreementRules) {
    rules.push(buildRule(bucket, "agreement", priority));
    priority += 10;
  }

  for (const bucket of defenseRules) {
    rules.push(buildRule(bucket, "defense", priority));
    priority += 10;
  }

  for (const bucket of reviewRules) {
    rules.push(buildRule(bucket, "review", priority));
    priority += 10;
  }

  if (rules.length === 0 && eligibleBuckets[0]) {
    rules.push(buildRule(eligibleBuckets[0], "review", 10));
  }

  return rules;
}

async function buildPolicyRuleToolResearch(
  featureBuckets: FeatureBucket[],
  options?: {
    runId?: string;
    calibrationAttempt?: number;
    historicalRows?: HistoricalCaseRow[];
    datasetSplit?: DatasetSplitSummary;
    trace?: AgentTraceContext;
  }
): Promise<Record<string, unknown>> {
  const planningMessage = await planPolicyToolResearch(
    {
      runId: options?.runId ?? "policy_rules_agent",
      calibrationAttempt: options?.calibrationAttempt ?? 1,
      datasetSplit: options?.datasetSplit,
      historicalRows: options?.historicalRows ?? [],
      featureBuckets
    },
    options?.trace
  );

  const executedToolCalls = await executeToolCallsFromMessage({
    message: planningMessage,
    tools: policyCalibrationTools,
    trace: options?.trace,
    executionLabel: "propose_policy_rules"
  });

  return buildToolResearchPayload(planningMessage, executedToolCalls);
}

export async function proposePolicyRules(
  featureBuckets: FeatureBucket[],
  options?: {
    runId?: string;
    calibrationAttempt?: number;
    historicalRows?: HistoricalCaseRow[];
    datasetSplit?: DatasetSplitSummary;
    toolResearch?: Record<string, unknown>;
    trace?: AgentTraceContext;
  }
): Promise<PolicyRuleDraft[]> {
  const calibrationAttempt = options?.calibrationAttempt ?? 1;
  const agentToolResearch = isOpenAIConfigured()
    ? await buildPolicyRuleToolResearch(featureBuckets, options)
    : {};
  const combinedToolResearch = {
    preloadedToolResearch: options?.toolResearch ?? {},
    inAgentToolResearch: agentToolResearch
  };

  const response = await invokeStructuredWithFallback({
    systemPrompt: proposePolicyRulesPrompt,
    userPrompt: [
      `Tentativa de calibracao: ${calibrationAttempt}.`,
      "Antes da resposta final, o agente executou um ciclo explicito de reason -> tool -> reason.",
      `Prompt do planejamento de pesquisa:\n${planPolicyToolResearchPrompt}`,
      "Use apenas os buckets abaixo.",
      "Priorize regras objetivas, auditaveis e operacionais.",
      "Resultado das tools de banco:",
      JSON.stringify(combinedToolResearch, null, 2),
      "Referencia deterministica inicial:",
      JSON.stringify(
        await proposePolicyRulesDeterministically(featureBuckets, options),
        null,
        2
      ),
      "Buckets disponiveis:",
      JSON.stringify(
        featureBuckets
          .sort(
            (left, right) =>
              right.expectedJudicialCost - left.expectedJudicialCost ||
              right.sampleSize - left.sampleSize
          )
          .slice(0, 80),
        null,
        2
      )
    ].join("\n\n"),
    schema: policyRulesResponseSchema,
    trace: options?.trace,
    fallback: async () => ({
      rules: await proposePolicyRulesDeterministically(featureBuckets, options)
    })
  });

  return response.rules.map((rule) => policyRuleDraftSchema.parse(rule));
}
