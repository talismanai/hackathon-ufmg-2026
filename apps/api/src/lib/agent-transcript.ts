import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { env } from "../config/env.js";
import { safeStringify } from "./json.js";

export type AgentTraceContext = {
  workflowType: string;
  agentName: string;
  runId?: string;
  caseId?: string;
  policyVersion?: string;
  logsPath?: string;
};

type AgentTranscriptEvent = AgentTraceContext & {
  phase: "node" | "llm";
  status: "success" | "error" | "fallback" | "llm_success";
  input?: unknown;
  output?: unknown;
  discussion?: {
    provider?: string;
    model?: string;
    systemPrompt?: string;
    userPrompt?: string;
    modelOutput?: unknown;
    fallbackReason?: string;
    errorMessage?: string;
  };
  createdAt?: string | Date;
};

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function resolveTraceRoot(
  logsPath: string | undefined,
  workflowType: string,
  executionId: string
): { rootDir: string; masterFilePath: string } {
  const resolvedLogsPath = logsPath
    ? path.resolve(process.cwd(), logsPath)
    : env.agentTranscriptDir;

  if (resolvedLogsPath.endsWith(".txt")) {
    return {
      rootDir: path.join(
        path.dirname(resolvedLogsPath),
        sanitizeSegment(path.basename(resolvedLogsPath, ".txt"))
      ),
      masterFilePath: resolvedLogsPath
    };
  }

  const rootDir = path.join(
    resolvedLogsPath,
    sanitizeSegment(workflowType),
    sanitizeSegment(`${workflowType}__${executionId}`)
  );

  return {
    rootDir,
    masterFilePath: path.join(rootDir, "transcript.txt")
  };
}

function resolveExecutionId(context: AgentTraceContext): string {
  return (
    context.runId ??
    context.caseId ??
    context.policyVersion ??
    "unknown_execution"
  );
}

function buildHeader(event: AgentTranscriptEvent): string[] {
  const createdAt =
    event.createdAt instanceof Date
      ? event.createdAt.toISOString()
      : event.createdAt ?? new Date().toISOString();

  return [
    "=".repeat(100),
    `timestamp: ${createdAt}`,
    `workflow: ${event.workflowType}`,
    `agent: ${event.agentName}`,
    `phase: ${event.phase}`,
    `status: ${event.status}`,
    `runId: ${event.runId ?? "-"}`,
    `caseId: ${event.caseId ?? "-"}`,
    `policyVersion: ${event.policyVersion ?? "-"}`
  ];
}

function buildPayloadSection(title: string, payload: unknown): string[] {
  return [`[${title}]`, safeStringify(payload)];
}

function buildDiscussionSection(
  discussion: AgentTranscriptEvent["discussion"]
): string[] {
  if (!discussion) {
    return [];
  }

  return [
    "[DISCUSSION]",
    `provider: ${discussion.provider ?? "-"}`,
    `model: ${discussion.model ?? "-"}`,
    discussion.systemPrompt ? `system_prompt:\n${discussion.systemPrompt}` : "",
    discussion.userPrompt ? `user_prompt:\n${discussion.userPrompt}` : "",
    discussion.modelOutput !== undefined
      ? `model_output:\n${safeStringify(discussion.modelOutput)}`
      : "",
    discussion.fallbackReason
      ? `fallback_reason: ${discussion.fallbackReason}`
      : "",
    discussion.errorMessage ? `error_message: ${discussion.errorMessage}` : ""
  ].filter(Boolean);
}

function formatEvent(event: AgentTranscriptEvent): string {
  return [
    ...buildHeader(event),
    "",
    ...buildPayloadSection("INPUT", event.input ?? {}),
    "",
    ...buildDiscussionSection(event.discussion),
    ...(event.discussion ? [""] : []),
    ...buildPayloadSection("OUTPUT", event.output ?? {}),
    ""
  ].join("\n");
}

export function getAgentTranscriptPaths(context: AgentTraceContext): {
  rootDir: string;
  masterFilePath: string;
  agentFilePath: string;
} {
  const executionId = resolveExecutionId(context);
  const { rootDir, masterFilePath } = resolveTraceRoot(
    context.logsPath,
    context.workflowType,
    executionId
  );

  return {
    rootDir,
    masterFilePath,
    agentFilePath: path.join(
      rootDir,
      "agents",
      `${sanitizeSegment(context.agentName)}.txt`
    )
  };
}

export function getTranscriptMasterFilePath(
  context: Omit<AgentTraceContext, "agentName"> & { agentName?: string }
): string {
  return getAgentTranscriptPaths({
    ...context,
    agentName: context.agentName ?? "workflow"
  }).masterFilePath;
}

export function getTranscriptMasterFilePathByExecution(params: {
  workflowType: string;
  executionId: string;
  logsPath?: string;
}): string {
  return resolveTraceRoot(
    params.logsPath,
    params.workflowType,
    params.executionId
  ).masterFilePath;
}

export async function appendAgentTranscript(
  event: AgentTranscriptEvent
): Promise<void> {
  const { rootDir, masterFilePath, agentFilePath } = getAgentTranscriptPaths(event);
  const formattedEvent = `${formatEvent(event)}\n`;

  await mkdir(rootDir, { recursive: true });
  await mkdir(path.dirname(agentFilePath), { recursive: true });
  await appendFile(masterFilePath, formattedEvent, "utf8");
  await appendFile(agentFilePath, formattedEvent, "utf8");
}
