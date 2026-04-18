import { prisma } from "../client.js";
import { appendAgentTranscript } from "../../lib/agent-transcript.js";
import { safeStringify } from "../../lib/json.js";

type AgentRunInput = {
  workflowType: string;
  agentName: string;
  caseId?: string;
  runId?: string;
  policyVersion?: string;
  logsPath?: string;
  input?: unknown;
  output?: unknown;
};

export async function createAgentRun({
  workflowType,
  agentName,
  caseId,
  runId,
  policyVersion,
  logsPath,
  input,
  output
}: AgentRunInput): Promise<void> {
  await prisma.agentRun.create({
    data: {
      workflowType,
      caseId,
      agentName,
      inputJson: input ? safeStringify(input) : null,
      outputJson: output ? safeStringify(output) : null
    }
  });

  await appendAgentTranscript({
    workflowType,
    agentName,
    runId,
    caseId,
    policyVersion,
    logsPath,
    phase: "node",
    status:
      output &&
      typeof output === "object" &&
      output !== null &&
      "errors" in output &&
      Array.isArray(output.errors) &&
      output.errors.length > 0
        ? "error"
        : "success",
    input,
    output
  });
}
