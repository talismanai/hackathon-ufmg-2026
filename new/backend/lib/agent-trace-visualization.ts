import { readFile } from "node:fs/promises";

import { getTranscriptMasterFilePathByExecution } from "./agent-transcript.js";
import { parseJson, safeStringify } from "./json.js";

type TranscriptDiscussion = {
  provider?: string;
  model?: string;
  systemPrompt?: string;
  userPrompt?: string;
  modelOutput?: unknown;
  fallbackReason?: string;
  errorMessage?: string;
  raw?: string;
};

export type ParsedTranscriptEvent = {
  index: number;
  timestamp: string;
  workflowType: string;
  agentName: string;
  phase: "node" | "llm";
  status: "success" | "error" | "fallback" | "llm_success";
  runId?: string;
  caseId?: string;
  policyVersion?: string;
  input: unknown;
  output: unknown;
  discussion?: TranscriptDiscussion;
  summary: string;
};

type TraceGraphNode = {
  id: string;
  label: string;
  phase: ParsedTranscriptEvent["phase"];
  status: ParsedTranscriptEvent["status"];
  summary: string;
};

type TraceGraphEdge = {
  from: string;
  to: string;
  label: string;
};

export type WorkflowTraceVisualization = {
  workflowType: string;
  executionId: string;
  transcriptPath: string;
  eventCount: number;
  nodes: TraceGraphNode[];
  edges: TraceGraphEdge[];
  events: ParsedTranscriptEvent[];
  mermaid: string;
};

function tryParseStructuredValue(value: string): unknown {
  const trimmed = value.trim();

  if (!trimmed) {
    return {};
  }

  if (
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    trimmed.startsWith('"')
  ) {
    return parseJson(trimmed, trimmed);
  }

  return trimmed;
}

function parseDiscussion(raw: string | undefined): TranscriptDiscussion | undefined {
  if (!raw) {
    return undefined;
  }

  const lines = raw.split("\n");
  const fieldMap = new Map<string, keyof TranscriptDiscussion>([
    ["provider:", "provider"],
    ["model:", "model"],
    ["system_prompt:", "systemPrompt"],
    ["user_prompt:", "userPrompt"],
    ["model_output:", "modelOutput"],
    ["fallback_reason:", "fallbackReason"],
    ["error_message:", "errorMessage"]
  ]);
  const values: Partial<Record<keyof TranscriptDiscussion, string>> = {};
  let currentKey: keyof TranscriptDiscussion | undefined;

  for (const line of lines) {
    const matchedField = [...fieldMap.entries()].find(([prefix]) =>
      line.startsWith(prefix)
    );

    if (matchedField) {
      const [prefix, targetKey] = matchedField;
      currentKey = targetKey;
      const initialValue = line.slice(prefix.length).trim();
      values[targetKey] = initialValue;
      continue;
    }

    if (currentKey) {
      values[currentKey] = [values[currentKey], line].filter(Boolean).join("\n");
    }
  }

  return {
    provider: values.provider,
    model: values.model,
    systemPrompt: values.systemPrompt,
    userPrompt: values.userPrompt,
    modelOutput: values.modelOutput
      ? tryParseStructuredValue(values.modelOutput)
      : undefined,
    fallbackReason: values.fallbackReason,
    errorMessage: values.errorMessage,
    raw
  };
}

function summarizeValue(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  if (Array.isArray(value)) {
    return `lista com ${value.length} item(ns)`;
  }

  const record = value as Record<string, unknown>;

  if (Array.isArray(record.toolResults)) {
    const toolNames = record.toolResults
      .map((item) =>
        item && typeof item === "object" && "name" in item
          ? String(item.name)
          : "tool"
      )
      .join(", ");
    return `tools: ${toolNames || "nenhuma"}`;
  }

  if (Array.isArray(record.requestedToolCalls)) {
    return `${record.requestedToolCalls.length} tool call(s) planejadas`;
  }

  if (Array.isArray(record.candidateRules)) {
    return `${record.candidateRules.length} regra(s) candidata(s)`;
  }

  if (Array.isArray(record.featureBuckets)) {
    return `${record.featureBuckets.length} bucket(s)`;
  }

  if (Array.isArray(record.historicalRows)) {
    return `${record.historicalRows.length} linha(s) historicas`;
  }

  if (Array.isArray(record.errors) && record.errors.length > 0) {
    return `${record.errors.length} erro(s)`;
  }

  if (record.decision && typeof record.decision === "object") {
    const decision = record.decision as Record<string, unknown>;
    if (typeof decision.action === "string") {
      return `decisao: ${decision.action}`;
    }
  }

  if (typeof record.policyLawyerSummary === "string") {
    return "resumo para advogado gerado";
  }

  if (record.scorecard && typeof record.scorecard === "object") {
    const scorecard = record.scorecard as Record<string, unknown>;
    if (typeof scorecard.policyScore === "number") {
      return `policy score ${(scorecard.policyScore * 100).toFixed(1)}%`;
    }
  }

  if (
    record.discussion &&
    typeof record.discussion === "object" &&
    "modelOutput" in (record.discussion as Record<string, unknown>)
  ) {
    return "resposta do modelo registrada";
  }

  return undefined;
}

function buildEventSummary(event: Omit<ParsedTranscriptEvent, "summary">): string {
  const discussionSummary = summarizeValue(event.discussion?.modelOutput);
  const outputSummary = summarizeValue(event.output);
  const inputSummary = summarizeValue(event.input);

  return (
    outputSummary ??
    discussionSummary ??
    inputSummary ??
    `${event.phase} ${event.status}`
  );
}

function parseEventBlock(
  block: string,
  index: number
): ParsedTranscriptEvent | null {
  const sectionMatches = [...block.matchAll(/\[(INPUT|DISCUSSION|OUTPUT)\]\n/g)];
  const headerText = block.slice(0, sectionMatches[0]?.index ?? block.length).trim();
  const sections = new Map<string, string>();

  for (const [matchIndex, match] of sectionMatches.entries()) {
    const sectionName = match[1];
    const start = (match.index ?? 0) + match[0].length;
    const end = sectionMatches[matchIndex + 1]?.index ?? block.length;
    sections.set(sectionName, block.slice(start, end).trim());
  }

  const headers = Object.fromEntries(
    headerText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf(":");
        if (separatorIndex === -1) {
          return [line, ""];
        }

        return [
          line.slice(0, separatorIndex).trim(),
          line.slice(separatorIndex + 1).trim()
        ];
      })
  );

  if (!headers.timestamp || !headers.workflow || !headers.agent) {
    return null;
  }

  const baseEvent = {
    index,
    timestamp: headers.timestamp,
    workflowType: headers.workflow,
    agentName: headers.agent,
    phase: (headers.phase as ParsedTranscriptEvent["phase"]) ?? "node",
    status: (headers.status as ParsedTranscriptEvent["status"]) ?? "success",
    runId: headers.runId && headers.runId !== "-" ? headers.runId : undefined,
    caseId: headers.caseId && headers.caseId !== "-" ? headers.caseId : undefined,
    policyVersion:
      headers.policyVersion && headers.policyVersion !== "-"
        ? headers.policyVersion
        : undefined,
    input: tryParseStructuredValue(sections.get("INPUT") ?? ""),
    output: tryParseStructuredValue(sections.get("OUTPUT") ?? ""),
    discussion: parseDiscussion(sections.get("DISCUSSION"))
  };

  return {
    ...baseEvent,
    summary: buildEventSummary(baseEvent)
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeMermaidLabel(value: string): string {
  return value.replaceAll('"', '\\"').replaceAll("\n", "<br/>");
}

function colorByEvent(event: ParsedTranscriptEvent): {
  fill: string;
  stroke: string;
  text: string;
} {
  if (event.status === "error") {
    return { fill: "#fee2e2", stroke: "#dc2626", text: "#7f1d1d" };
  }

  if (event.status === "fallback") {
    return { fill: "#ffedd5", stroke: "#ea580c", text: "#9a3412" };
  }

  if (event.phase === "llm") {
    return { fill: "#eff6ff", stroke: "#2563eb", text: "#1e3a8a" };
  }

  return { fill: "#ecfdf5", stroke: "#059669", text: "#065f46" };
}

export function parseTranscriptContent(content: string): ParsedTranscriptEvent[] {
  return content
    .split(/={80,}\n/g)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => parseEventBlock(block, index + 1))
    .filter((event): event is ParsedTranscriptEvent => event !== null);
}

function buildTraceGraph(events: ParsedTranscriptEvent[]): {
  nodes: TraceGraphNode[];
  edges: TraceGraphEdge[];
} {
  const nodes = events.map((event) => ({
    id: `event_${event.index}`,
    label: `${event.index}. ${event.agentName}`,
    phase: event.phase,
    status: event.status,
    summary: event.summary
  }));
  const edges = events.slice(0, -1).map((event, index) => ({
    from: `event_${event.index}`,
    to: `event_${events[index + 1].index}`,
    label: `${event.agentName} -> ${events[index + 1].agentName}`
  }));

  return { nodes, edges };
}

function buildMermaid(events: ParsedTranscriptEvent[]): string {
  const lines = [
    "flowchart TD",
    "classDef ok fill:#ecfdf5,stroke:#059669,color:#065f46,stroke-width:2px;",
    "classDef llm fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,stroke-width:2px;",
    "classDef fallback fill:#ffedd5,stroke:#ea580c,color:#9a3412,stroke-width:2px;",
    "classDef error fill:#fee2e2,stroke:#dc2626,color:#7f1d1d,stroke-width:2px;"
  ];

  for (const event of events) {
    const className =
      event.status === "error"
        ? "error"
        : event.status === "fallback"
          ? "fallback"
          : event.phase === "llm"
            ? "llm"
            : "ok";
    lines.push(
      `event_${event.index}["${escapeMermaidLabel(
        `${event.index}. ${event.agentName}\n${event.phase} / ${event.status}\n${event.summary}`
      )}"]:::${className}`
    );
  }

  for (const [index, event] of events.slice(0, -1).entries()) {
    lines.push(`event_${event.index} --> event_${events[index + 1].index}`);
  }

  return lines.join("\n");
}

function buildSvg(events: ParsedTranscriptEvent[]): string {
  const width = 980;
  const cardWidth = 760;
  const cardHeight = 94;
  const startX = 100;
  const startY = 40;
  const gapY = 54;
  const totalHeight = startY * 2 + events.length * (cardHeight + gapY);

  const eventNodes = events
    .map((event, index) => {
      const y = startY + index * (cardHeight + gapY);
      const colors = colorByEvent(event);
      const detailY = y + 52;
      const summary = escapeHtml(event.summary);

      return [
        index > 0
          ? `<line x1="${startX + cardWidth / 2}" y1="${y - gapY + 8}" x2="${startX + cardWidth / 2}" y2="${y - 8}" stroke="#94a3b8" stroke-width="3" marker-end="url(#arrow)" />`
          : "",
        `<a href="#event-${event.index}" aria-label="Ir para detalhes do evento ${event.index}">`,
        `<rect x="${startX}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="18" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2"></rect>`,
        `<text x="${startX + 22}" y="${y + 30}" font-size="20" font-weight="700" fill="${colors.text}">${escapeHtml(
          `${event.index}. ${event.agentName}`
        )}</text>`,
        `<text x="${startX + 22}" y="${y + 58}" font-size="14" fill="${colors.text}">${escapeHtml(
          `${event.phase} / ${event.status}`
        )}</text>`,
        `<text x="${startX + 240}" y="${detailY}" font-size="14" fill="#334155">${summary}</text>`,
        `</a>`
      ].join("");
    })
    .join("");

  return [
    `<svg viewBox="0 0 ${width} ${totalHeight}" role="img" aria-label="Fluxo de agentes">`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8"></path></marker></defs>`,
    eventNodes,
    `</svg>`
  ].join("");
}

function buildEventCard(event: ParsedTranscriptEvent): string {
  return [
    `<details class="event-card" id="event-${event.index}" ${
      event.index === 1 ? "open" : ""
    }>`,
    `<summary><span class="event-title">${escapeHtml(
      `${event.index}. ${event.agentName}`
    )}</span><span class="event-meta">${escapeHtml(
      `${event.phase} / ${event.status} / ${event.timestamp}`
    )}</span></summary>`,
    `<p class="event-summary">${escapeHtml(event.summary)}</p>`,
    `<div class="event-grid">`,
    `<section><h3>Input</h3><pre>${escapeHtml(safeStringify(event.input))}</pre></section>`,
    `<section><h3>Output</h3><pre>${escapeHtml(safeStringify(event.output))}</pre></section>`,
    `<section><h3>Discussion</h3><pre>${escapeHtml(
      event.discussion?.raw ?? "Sem discussion registrada."
    )}</pre></section>`,
    `</div>`,
    `</details>`
  ].join("");
}

function buildHtml(visualization: WorkflowTraceVisualization): string {
  const header = `${visualization.workflowType} / ${visualization.executionId}`;

  return [
    "<!doctype html>",
    "<html lang=\"pt-BR\">",
    "<head>",
    "<meta charset=\"utf-8\" />",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    `<title>${escapeHtml(header)}</title>`,
    "<style>",
    "body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#f8fafc;color:#0f172a;}",
    ".page{max-width:1200px;margin:0 auto;padding:32px 24px 80px;}",
    ".hero{display:grid;gap:12px;margin-bottom:24px;}",
    ".hero h1{margin:0;font-size:28px;}",
    ".meta{display:flex;flex-wrap:wrap;gap:12px;color:#475569;font-size:14px;}",
    ".meta span{background:white;border:1px solid #e2e8f0;border-radius:999px;padding:8px 12px;}",
    ".diagram{background:white;border:1px solid #e2e8f0;border-radius:24px;padding:16px;box-shadow:0 12px 30px rgba(15,23,42,.06);overflow:auto;}",
    ".legend{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0 24px;}",
    ".badge{border-radius:999px;padding:8px 12px;font-size:13px;font-weight:600;}",
    ".ok{background:#dcfce7;color:#166534;}",
    ".llm{background:#dbeafe;color:#1d4ed8;}",
    ".fallback{background:#fed7aa;color:#c2410c;}",
    ".error{background:#fecaca;color:#b91c1c;}",
    ".section-title{margin:28px 0 12px;font-size:20px;}",
    ".mermaid-box,.event-card{background:white;border:1px solid #e2e8f0;border-radius:20px;box-shadow:0 10px 24px rgba(15,23,42,.05);}",
    ".mermaid-box{padding:20px;margin-bottom:24px;}",
    ".mermaid-box pre{margin:0;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.5;}",
    ".event-card{padding:0 18px;margin-bottom:16px;}",
    ".event-card summary{display:flex;justify-content:space-between;gap:12px;padding:18px 0;cursor:pointer;list-style:none;}",
    ".event-card summary::-webkit-details-marker{display:none;}",
    ".event-title{font-weight:700;}",
    ".event-meta{font-size:13px;color:#64748b;}",
    ".event-summary{margin:0 0 18px;color:#334155;}",
    ".event-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;padding-bottom:18px;}",
    ".event-grid section{border:1px solid #e2e8f0;border-radius:16px;padding:14px;background:#f8fafc;min-width:0;}",
    ".event-grid h3{margin:0 0 10px;font-size:14px;color:#334155;}",
    ".event-grid pre{margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.45;color:#0f172a;}",
    "</style>",
    "</head>",
    "<body>",
    "<main class=\"page\">",
    `<header class="hero"><h1>${escapeHtml(header)}</h1><div class="meta"><span>Eventos: ${visualization.eventCount}</span><span>Transcript: ${escapeHtml(
      visualization.transcriptPath
    )}</span></div></header>`,
    "<div class=\"legend\"><span class=\"badge ok\">node success</span><span class=\"badge llm\">llm success</span><span class=\"badge fallback\">fallback</span><span class=\"badge error\">error</span></div>",
    `<section class="diagram">${buildSvg(visualization.events)}</section>`,
    "<h2 class=\"section-title\">Mermaid</h2>",
    `<section class="mermaid-box"><pre>${escapeHtml(
      visualization.mermaid
    )}</pre></section>`,
    "<h2 class=\"section-title\">Detalhes Dos Eventos</h2>",
    visualization.events.map(buildEventCard).join(""),
    "</main>",
    "</body>",
    "</html>"
  ].join("");
}

export async function loadWorkflowTraceVisualization(params: {
  workflowType: string;
  executionId: string;
  logsPath?: string;
}): Promise<WorkflowTraceVisualization> {
  const transcriptPath = getTranscriptMasterFilePathByExecution(params);
  const transcriptContent = await readFile(transcriptPath, "utf8");
  const events = parseTranscriptContent(transcriptContent);
  const { nodes, edges } = buildTraceGraph(events);
  const mermaid = buildMermaid(events);

  return {
    workflowType: params.workflowType,
    executionId: params.executionId,
    transcriptPath,
    eventCount: events.length,
    nodes,
    edges,
    events,
    mermaid
  };
}

export async function loadWorkflowTraceHtml(params: {
  workflowType: string;
  executionId: string;
  logsPath?: string;
}): Promise<string> {
  return buildHtml(await loadWorkflowTraceVisualization(params));
}
