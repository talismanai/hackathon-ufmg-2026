import { z } from "zod";
import { tool } from "@langchain/core/tools";

import { listHistoricalCases } from "../db/repositories/historical-case-repository.js";
import { getActivePolicy } from "../db/repositories/policy-repository.js";
import { parseJson } from "../lib/json.js";
import { average, isFavorableOutcome, median } from "../lib/policy-calibration.js";
import { buildFeatureBuckets } from "../services/policy-calibration/build-feature-buckets.js";
import { normalizeHistoricalRow } from "../services/policy-calibration/load-historical-data.js";

const getHistoricalOverviewInputSchema = z.object({
  processType: z.string().optional(),
  uf: z.string().optional()
});

const getBucketCandidatesInputSchema = z.object({
  limit: z.number().int().positive().max(20).default(8),
  focus: z.enum(["agreement", "defense", "review"]).default("agreement")
});

const getCurrentPolicySnapshotInputSchema = z.object({});

async function loadNormalizedHistoricalRows() {
  const historicalCases = await listHistoricalCases();

  return historicalCases.map((historicalCase) =>
    normalizeHistoricalRow({
      caseNumber: historicalCase.caseNumber ?? historicalCase.id,
      processType: historicalCase.processType,
      uf: historicalCase.uf,
      courtDistrict: historicalCase.courtDistrict,
      causeValueBrl: historicalCase.causeValueBrl ?? 0,
      outcome: historicalCase.outcome,
      condemnationValueBrl: historicalCase.condemnationValueBrl ?? 0,
      features: parseJson<Record<string, unknown>>(historicalCase.featuresJson, {}),
      source: parseJson<Record<string, unknown>>(historicalCase.sourceJson, {
        source: "historical_cases"
      })
    })
  );
}

export const getHistoricalOverviewTool = tool(
  async ({ processType, uf }) => {
    const rows = (await loadNormalizedHistoricalRows()).filter((row) => {
      if (processType && row.processType !== processType) {
        return false;
      }

      if (uf && row.uf !== uf) {
        return false;
      }

      return true;
    });

    const losses = rows.filter((row) => !isFavorableOutcome(row.outcome));
    const condemnations = losses
      .map((row) => row.condemnationValueBrl)
      .filter((value) => value > 0);

    return {
      totalCases: rows.length,
      lossRate: rows.length === 0 ? 0 : losses.length / rows.length,
      medianCondemnationBrl: median(condemnations),
      avgCondemnationBrl: average(condemnations),
      topOutcomes: Object.entries(
        rows.reduce<Record<string, number>>((accumulator, row) => {
          accumulator[row.outcome] = (accumulator[row.outcome] ?? 0) + 1;
          return accumulator;
        }, {})
      )
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5)
        .map(([outcome, count]) => ({ outcome, count }))
    };
  },
  {
    name: "get_historical_overview",
    description:
      "Resume o historico armazenado no SQLite, incluindo tamanho da base, taxa de perda e estatisticas de condenacao.",
    schema: getHistoricalOverviewInputSchema
  }
);

export const getBucketCandidatesTool = tool(
  async ({ limit, focus }) => {
    const buckets = buildFeatureBuckets(await loadNormalizedHistoricalRows());
    const filteredBuckets = [...buckets]
      .filter((bucket) => {
        if (focus === "agreement") {
          return bucket.lossRate >= 0.45;
        }

        if (focus === "defense") {
          return bucket.lossRate <= 0.35;
        }

        return bucket.lossRate > 0.35 && bucket.lossRate < 0.55;
      })
      .sort((left, right) => {
        if (focus === "defense") {
          return left.lossRate - right.lossRate || right.sampleSize - left.sampleSize;
        }

        return (
          right.expectedJudicialCost - left.expectedJudicialCost ||
          right.sampleSize - left.sampleSize
        );
      })
      .slice(0, limit);

    return {
      focus,
      buckets: filteredBuckets.map((bucket) => ({
        bucketKey: bucket.bucketKey,
        sampleSize: bucket.sampleSize,
        lossRate: bucket.lossRate,
        expectedJudicialCost: bucket.expectedJudicialCost,
        medianCondemnationBrl: bucket.medianCondemnationBrl,
        featureSnapshot: bucket.featureSnapshot
      }))
    };
  },
  {
    name: "get_bucket_candidates",
    description:
      "Retorna buckets promissores do historico para acordo, defesa ou revisao, calculados a partir dos dados no SQLite.",
    schema: getBucketCandidatesInputSchema
  }
);

export const getCurrentPolicySnapshotTool = tool(
  async () => {
    const policy = await getActivePolicy();

    if (!policy) {
      return {
        found: false,
        message: "Nenhuma policy ativa publicada."
      };
    }

    return {
      found: true,
      policy: {
        policyId: policy.policyId,
        version: policy.version,
        name: policy.name,
        status: policy.status,
        processType: policy.processType,
        minOffer: policy.minOffer,
        maxOffer: policy.maxOffer
      },
      rules: policy.rules.map((rule) => ({
        ruleKey: rule.ruleKey,
        action: rule.action,
        priority: rule.priority,
        conditionSummary: rule.conditionSummary,
        explanation: rule.explanation
      }))
    };
  },
  {
    name: "get_current_policy_snapshot",
    description:
      "Recupera a policy atualmente publicada no SQLite para comparacao e continuidade da calibracao.",
    schema: getCurrentPolicySnapshotInputSchema
  }
);

export const policyCalibrationTools = [
  getHistoricalOverviewTool,
  getBucketCandidatesTool,
  getCurrentPolicySnapshotTool
];
