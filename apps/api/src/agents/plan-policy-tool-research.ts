import { AIMessage } from "@langchain/core/messages";
import type {
  DatasetSplitSummary,
  FeatureBucket,
  HistoricalCaseRow,
  PolicyRuleDraft
} from "@grupo4/shared";

import type { AgentTraceContext } from "../lib/agent-transcript.js";
import { invokeToolCallingWithFallback } from "../lib/llm.js";
import { planPolicyToolResearchPrompt } from "../prompts/policy-calibration.js";
import { policyCalibrationTools } from "../tools/policy-calibration-tools.js";

function buildDefaultToolRequest(): AIMessage {
  return new AIMessage({
    content:
      "Vou confirmar o panorama historico, buckets candidatos e policy vigente antes de seguir com a calibracao.",
    tool_calls: [
      {
        id: "call_historical_overview",
        name: "get_historical_overview",
        args: {}
      },
      {
        id: "call_bucket_candidates_agreement",
        name: "get_bucket_candidates",
        args: {
          limit: 6,
          focus: "agreement"
        }
      },
      {
        id: "call_bucket_candidates_defense",
        name: "get_bucket_candidates",
        args: {
          limit: 4,
          focus: "defense"
        }
      },
      {
        id: "call_current_policy_snapshot",
        name: "get_current_policy_snapshot",
        args: {}
      }
    ]
  });
}

export async function planPolicyToolResearch(input: {
  runId: string;
  calibrationAttempt: number;
  datasetSplit?: DatasetSplitSummary;
  historicalRows: HistoricalCaseRow[];
  featureBuckets: FeatureBucket[];
  candidateRules?: PolicyRuleDraft[];
}, trace?: AgentTraceContext): Promise<AIMessage> {
  const response = await invokeToolCallingWithFallback({
    systemPrompt: planPolicyToolResearchPrompt,
    userPrompt: [
      "Avalie se vale consultar tools antes de gerar ou criticar a policy.",
      "Use tools para confirmar historico, buckets relevantes e policy vigente no banco.",
      JSON.stringify(
        {
          runId: input.runId,
          calibrationAttempt: input.calibrationAttempt,
          datasetSplit: input.datasetSplit,
          historicalRowsCount: input.historicalRows.length,
          featureBucketsCount: input.featureBuckets.length,
          topBuckets: input.featureBuckets.slice(0, 8),
          candidateRules: input.candidateRules ?? []
        },
        null,
        2
      )
    ].join("\n\n"),
    tools: policyCalibrationTools,
    trace,
    fallback: () => buildDefaultToolRequest()
  });

  if ((response.tool_calls?.length ?? 0) === 0) {
    return buildDefaultToolRequest();
  }

  return response;
}
