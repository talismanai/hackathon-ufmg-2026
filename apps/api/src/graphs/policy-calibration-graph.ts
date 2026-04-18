import { Annotation, START, END, StateGraph, addMessages } from "@langchain/langgraph";
import {
  isAIMessage,
  isToolMessage,
  type BaseMessage
} from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import {
  MAX_POLICY_RETRIES,
  POLICY_CALIBRATION_WORKFLOW,
  TARGET_POLICY_SCORE,
  policyCritiqueReportSchema,
  policyRuleDraftSchema,
  policyScorecardSchema,
  type PolicyCalibrationState
} from "@grupo4/shared";

import { critiquePolicyRules } from "../agents/critique-policy-rules.js";
import { explainPolicyForLawyer } from "../agents/explain-policy-for-lawyer.js";
import { planPolicyToolResearch } from "../agents/plan-policy-tool-research.js";
import { proposePolicyRules } from "../agents/propose-policy-rules.js";
import { createAgentRun } from "../db/repositories/agent-run-repository.js";
import { buildFeatureBuckets } from "../services/policy-calibration/build-feature-buckets.js";
import { loadHistoricalData } from "../services/policy-calibration/load-historical-data.js";
import { publishPolicyVersion } from "../services/policy-calibration/publish-policy-version.js";
import { scorePolicyRules } from "../services/policy-calibration/score-policy-rules.js";
import { splitHistoricalData } from "../services/policy-calibration/split-historical-data.js";
import { policyCalibrationTools } from "../tools/policy-calibration-tools.js";

type GraphPolicyCalibrationState = PolicyCalibrationState & {
  messages: BaseMessage[];
  toolResearch?: Record<string, unknown>;
};

const policyCalibrationToolNode = new ToolNode(policyCalibrationTools);

function parseToolContent(content: unknown): unknown {
  if (typeof content === "string") {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }

  return content;
}

const policyCalibrationState = Annotation.Root({
  runId: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => ""
  }),
  inputCsvPath: Annotation<string | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  logsPath: Annotation<string | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  calibrationAttempt: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 1
  }),
  historicalRows: Annotation<PolicyCalibrationState["historicalRows"]>({
    reducer: (_current, update) => update,
    default: () => []
  }),
  trainingRows: Annotation<PolicyCalibrationState["trainingRows"]>({
    reducer: (_current, update) => update,
    default: () => []
  }),
  evaluationRows: Annotation<PolicyCalibrationState["evaluationRows"]>({
    reducer: (_current, update) => update,
    default: () => []
  }),
  datasetSplit: Annotation<PolicyCalibrationState["datasetSplit"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  featureBuckets: Annotation<PolicyCalibrationState["featureBuckets"]>({
    reducer: (_current, update) => update,
    default: () => []
  }),
  candidateRules: Annotation<PolicyCalibrationState["candidateRules"]>({
    reducer: (_current, update) => update,
    default: () => []
  }),
  critiqueReport: Annotation<PolicyCalibrationState["critiqueReport"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  scorecard: Annotation<PolicyCalibrationState["scorecard"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  bestCandidateRules: Annotation<PolicyCalibrationState["bestCandidateRules"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  bestCritiqueReport: Annotation<PolicyCalibrationState["bestCritiqueReport"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  bestScorecard: Annotation<PolicyCalibrationState["bestScorecard"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  policyLawyerSummary: Annotation<PolicyCalibrationState["policyLawyerSummary"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  publishedPolicy: Annotation<PolicyCalibrationState["publishedPolicy"]>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  messages: Annotation<BaseMessage[]>({
    reducer: addMessages,
    default: () => []
  }),
  toolResearch: Annotation<Record<string, unknown> | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined
  }),
  errors: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => []
  })
});

async function runNode<TDelta extends Partial<GraphPolicyCalibrationState>>(
  agentName: string,
  state: GraphPolicyCalibrationState,
  fn: () => Promise<TDelta>
): Promise<TDelta> {
  if (state.errors.length > 0) {
    return {} as TDelta;
  }

  try {
    const delta = await fn();
    await createAgentRun({
      workflowType: POLICY_CALIBRATION_WORKFLOW,
      agentName,
      runId: state.runId,
      logsPath: state.logsPath,
      input: {
        runId: state.runId,
        inputCsvPath: state.inputCsvPath,
        historicalRowCount: state.historicalRows.length,
        featureBucketCount: state.featureBuckets.length,
        candidateRuleCount: state.candidateRules.length
      },
      output: delta
    });
    return delta;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha desconhecida no workflow.";
    const errors = [...state.errors, `${agentName}: ${message}`];

    await createAgentRun({
      workflowType: POLICY_CALIBRATION_WORKFLOW,
      agentName,
      runId: state.runId,
      logsPath: state.logsPath,
      input: {
        runId: state.runId
      },
      output: {
        errors
      }
    });

    return {
      errors
    } as TDelta;
  }
}

async function loadHistoricalDataNode(
  state: GraphPolicyCalibrationState
): Promise<Partial<GraphPolicyCalibrationState>> {
  return runNode("loadHistoricalData", state, async () => {
    const { historicalRows } = await loadHistoricalData(state.inputCsvPath);

    return {
      historicalRows
    };
  });
}

async function splitHistoricalDataNode(
  state: GraphPolicyCalibrationState
): Promise<Partial<GraphPolicyCalibrationState>> {
  return runNode("splitHistoricalData", state, async () =>
    splitHistoricalData(state.historicalRows)
  );
}

async function buildFeatureBucketsNode(
  state: GraphPolicyCalibrationState
): Promise<Partial<GraphPolicyCalibrationState>> {
  return runNode("buildFeatureBuckets", state, async () => ({
    featureBuckets: buildFeatureBuckets(state.trainingRows)
  }));
}

async function planPolicyToolResearchNode(
  state: GraphPolicyCalibrationState
): Promise<Partial<GraphPolicyCalibrationState>> {
  return runNode("planPolicyToolResearch", state, async () => {
    const response = await planPolicyToolResearch(
      {
        runId: state.runId,
        calibrationAttempt: state.calibrationAttempt,
        datasetSplit: state.datasetSplit,
        historicalRows: state.historicalRows,
        featureBuckets: state.featureBuckets,
        candidateRules: state.candidateRules
      },
      {
        workflowType: POLICY_CALIBRATION_WORKFLOW,
        agentName: "planPolicyToolResearch",
        runId: state.runId,
        logsPath: state.logsPath
      }
    );

    return {
      messages: [response]
    };
  });
}

async function executePolicyResearchToolsNode(
  state: GraphPolicyCalibrationState
): Promise<Partial<GraphPolicyCalibrationState>> {
  return runNode("executePolicyResearchTools", state, async () => {
    const toolResult = await policyCalibrationToolNode.invoke({
      messages: state.messages
    });

    return {
      messages: toolResult.messages as BaseMessage[]
    };
  });
}

async function summarizePolicyToolResearchNode(
  state: GraphPolicyCalibrationState
): Promise<Partial<GraphPolicyCalibrationState>> {
  return runNode("summarizePolicyToolResearch", state, async () => {
    const requestedToolCalls = state.messages
      .filter(isAIMessage)
      .flatMap((message) =>
        (message.tool_calls ?? []).map((toolCall) => ({
          id: toolCall.id,
          name: toolCall.name,
          args: toolCall.args
        }))
      );
    const toolResults = state.messages.filter(isToolMessage).map((message) => ({
      name: message.name ?? "unknown_tool",
      toolCallId: message.tool_call_id,
      result: parseToolContent(message.content)
    }));

    return {
      toolResearch: {
        requestedToolCalls,
        toolResults
      }
    };
  });
}

async function proposePolicyRulesNode(
  state: GraphPolicyCalibrationState
): Promise<Partial<GraphPolicyCalibrationState>> {
  return runNode("proposePolicyRules", state, async () => ({
    candidateRules: (
      await proposePolicyRules(state.featureBuckets, {
        runId: state.runId,
        calibrationAttempt: state.calibrationAttempt,
        historicalRows: state.historicalRows,
        datasetSplit: state.datasetSplit,
        toolResearch: state.toolResearch,
        trace: {
          workflowType: POLICY_CALIBRATION_WORKFLOW,
          agentName: "proposePolicyRules",
          runId: state.runId,
          logsPath: state.logsPath
        }
      })
    ).map((rule) => policyRuleDraftSchema.parse(rule))
  }));
}

async function critiquePolicyRulesNode(
  state: GraphPolicyCalibrationState
): Promise<Partial<GraphPolicyCalibrationState>> {
  return runNode("critiquePolicyRules", state, async () => ({
    critiqueReport: policyCritiqueReportSchema.parse(
      await critiquePolicyRules(
        state.candidateRules,
        state.toolResearch,
        {
          workflowType: POLICY_CALIBRATION_WORKFLOW,
          agentName: "critiquePolicyRules",
          runId: state.runId,
          logsPath: state.logsPath
        }
      )
    )
  }));
}

async function scorePolicyRulesNode(
  state: GraphPolicyCalibrationState
): Promise<Partial<GraphPolicyCalibrationState>> {
  return runNode("scorePolicyRules", state, async () => {
    const currentScorecard = policyScorecardSchema.parse(
      scorePolicyRules(
        state.evaluationRows,
        state.featureBuckets,
        state.candidateRules,
        state.trainingRows.length
      )
    );
    const bestPolicyScore = state.bestScorecard?.policyScore ?? -1;
    const shouldPromoteCurrent = currentScorecard.policyScore >= bestPolicyScore;

    return {
      scorecard: currentScorecard,
      bestScorecard: shouldPromoteCurrent ? currentScorecard : state.bestScorecard,
      bestCandidateRules: shouldPromoteCurrent
        ? state.candidateRules
        : state.bestCandidateRules,
      bestCritiqueReport: shouldPromoteCurrent
        ? state.critiqueReport
        : state.bestCritiqueReport
    };
  });
}

async function prepareRetryNode(
  state: GraphPolicyCalibrationState
): Promise<Partial<GraphPolicyCalibrationState>> {
  return runNode("prepareRetry", state, async () => ({
    calibrationAttempt: state.calibrationAttempt + 1
  }));
}

async function finalizePolicyCandidateNode(
  state: GraphPolicyCalibrationState
): Promise<Partial<GraphPolicyCalibrationState>> {
  return runNode("finalizePolicyCandidate", state, async () => ({
    candidateRules: state.bestCandidateRules ?? state.candidateRules,
    critiqueReport: state.bestCritiqueReport ?? state.critiqueReport,
    scorecard: state.bestScorecard ?? state.scorecard
  }));
}

async function explainPolicyForLawyerNode(
  state: GraphPolicyCalibrationState
): Promise<Partial<GraphPolicyCalibrationState>> {
  return runNode("explainPolicyForLawyer", state, async () => ({
    policyLawyerSummary: await explainPolicyForLawyer(state, {
      workflowType: POLICY_CALIBRATION_WORKFLOW,
      agentName: "explainPolicyForLawyer",
      runId: state.runId,
      logsPath: state.logsPath
    })
  }));
}

async function publishPolicyVersionNode(
  state: GraphPolicyCalibrationState
): Promise<Partial<GraphPolicyCalibrationState>> {
  return runNode("publishPolicyVersion", state, async () => ({
    publishedPolicy: await publishPolicyVersion(state)
  }));
}

export const policyCalibrationGraph = new StateGraph(policyCalibrationState)
  .addNode("loadHistoricalData", loadHistoricalDataNode)
  .addNode("splitHistoricalData", splitHistoricalDataNode)
  .addNode("buildFeatureBuckets", buildFeatureBucketsNode)
  .addNode("planPolicyToolResearch", planPolicyToolResearchNode)
  .addNode("executePolicyResearchTools", executePolicyResearchToolsNode)
  .addNode("summarizePolicyToolResearch", summarizePolicyToolResearchNode)
  .addNode("proposePolicyRules", proposePolicyRulesNode)
  .addNode("critiquePolicyRules", critiquePolicyRulesNode)
  .addNode("scorePolicyRules", scorePolicyRulesNode)
  .addNode("prepareRetry", prepareRetryNode)
  .addNode("finalizePolicyCandidate", finalizePolicyCandidateNode)
  .addNode("explainPolicyForLawyer", explainPolicyForLawyerNode)
  .addNode("publishPolicyVersion", publishPolicyVersionNode)
  .addEdge(START, "loadHistoricalData")
  .addEdge("loadHistoricalData", "splitHistoricalData")
  .addEdge("splitHistoricalData", "buildFeatureBuckets")
  .addEdge("buildFeatureBuckets", "planPolicyToolResearch")
  .addConditionalEdges("planPolicyToolResearch", (state) => {
    const lastMessage = state.messages[state.messages.length - 1];

    if (lastMessage && isAIMessage(lastMessage) && (lastMessage.tool_calls?.length ?? 0) > 0) {
      return "executePolicyResearchTools";
    }

    return "summarizePolicyToolResearch";
  })
  .addEdge("executePolicyResearchTools", "summarizePolicyToolResearch")
  .addEdge("summarizePolicyToolResearch", "proposePolicyRules")
  .addEdge("proposePolicyRules", "critiquePolicyRules")
  .addEdge("critiquePolicyRules", "scorePolicyRules")
  .addConditionalEdges("scorePolicyRules", (state) => {
    if (
      state.scorecard &&
      state.scorecard.policyScore < TARGET_POLICY_SCORE &&
      state.calibrationAttempt < MAX_POLICY_RETRIES
    ) {
      return "prepareRetry";
    }

    return "finalizePolicyCandidate";
  })
  .addEdge("prepareRetry", "planPolicyToolResearch")
  .addEdge("finalizePolicyCandidate", "explainPolicyForLawyer")
  .addEdge("explainPolicyForLawyer", "publishPolicyVersion")
  .addEdge("publishPolicyVersion", END)
  .compile();

export async function runPolicyCalibration(
  input: Pick<PolicyCalibrationState, "runId" | "inputCsvPath" | "logsPath">
): Promise<PolicyCalibrationState> {
  return policyCalibrationGraph.invoke(
    {
      runId: input.runId,
      inputCsvPath: input.inputCsvPath,
      logsPath: input.logsPath,
      calibrationAttempt: 1,
      historicalRows: [],
      trainingRows: [],
      evaluationRows: [],
      featureBuckets: [],
      candidateRules: [],
      messages: [],
      errors: []
    },
    {
      recursionLimit: 100
    }
  );
}
