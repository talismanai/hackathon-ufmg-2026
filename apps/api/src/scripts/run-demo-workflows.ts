import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

import { getTranscriptMasterFilePath } from "../lib/agent-transcript.js";
import { parseTranscriptContent } from "../lib/agent-trace-visualization.js";

type JsonRecord = Record<string, unknown>;

type CreatedCaseResponse = {
  item: {
    id: string;
  };
};

type AnalyzeCaseResponse = {
  analysisId: string;
  traceViewerUrl?: string;
  traceJsonUrl?: string;
  decision: {
    action: string;
    offerTarget?: number;
  };
};

type CalibratePolicyResponse = {
  runId: string;
  traceViewerUrl?: string;
  traceJsonUrl?: string;
  publishedPolicy?: {
    version: string;
    status: string;
  };
};

const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";
const shouldOpenFronts =
  process.env.OPEN_TRACE_VIEWS !== "false" && !process.argv.includes("--no-open");
const csvPath =
  process.env.DEMO_INPUT_CSV_PATH ??
  path.resolve(
    process.cwd(),
    "Cópia de Hackaton_Enter_Base_Candidatos.xlsx - Resultados dos processos.csv"
  );

function buildAbsoluteUrl(relativeOrAbsoluteUrl: string | undefined): string | undefined {
  if (!relativeOrAbsoluteUrl) {
    return undefined;
  }

  if (relativeOrAbsoluteUrl.startsWith("http://") || relativeOrAbsoluteUrl.startsWith("https://")) {
    return relativeOrAbsoluteUrl;
  }

  return new URL(relativeOrAbsoluteUrl, `${baseUrl}/`).toString();
}

async function fetchJson<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(endpoint, `${baseUrl}/`), init);
  const text = await response.text();
  const parsedBody = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `Falha em ${endpoint}: HTTP ${response.status}\n${JSON.stringify(parsedBody, null, 2)}`
    );
  }

  return parsedBody as T;
}

async function ensureApiIsUp(): Promise<void> {
  const response = await fetch(new URL("/health", `${baseUrl}/`));

  if (!response.ok) {
    throw new Error(`API indisponivel em ${baseUrl}.`);
  }
}

function openUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    const command =
      platform === "darwin"
        ? "open"
        : platform === "win32"
          ? "cmd"
          : "xdg-open";
    const args =
      platform === "darwin"
        ? [url]
        : platform === "win32"
          ? ["/c", "start", "", url]
          : [url];

    const child = spawn(command, args, {
      stdio: "ignore"
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Comando ${command} retornou codigo ${code ?? "desconhecido"}.`));
    });
  });
}

async function maybeOpenFront(url: string | undefined): Promise<void> {
  if (!shouldOpenFronts || !url) {
    return;
  }

  try {
    await openUrl(url);
  } catch (error) {
    console.warn(
      `Nao foi possivel abrir ${url} automaticamente: ${
        error instanceof Error ? error.message : "erro desconhecido"
      }`
    );
    console.warn(`Abra manualmente no navegador: ${url}`);
  }
}

async function createCase(payload: JsonRecord): Promise<string> {
  const response = await fetchJson<CreatedCaseResponse>("/api/cases", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return response.item.id;
}

async function uploadDocuments(caseId: string, items: JsonRecord[]): Promise<void> {
  await fetchJson(`/api/cases/${caseId}/documents`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ items })
  });
}

async function analyzeCase(caseId: string): Promise<AnalyzeCaseResponse> {
  return fetchJson<AnalyzeCaseResponse>(`/api/cases/${caseId}/analyze`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({})
  });
}

async function registerLawyerAction(
  caseId: string,
  analysisId: string,
  payload: JsonRecord
): Promise<void> {
  await fetchJson(`/api/cases/${caseId}/lawyer-action`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      analysisId,
      ...payload
    })
  });
}

function printSection(title: string, payload: unknown): void {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(payload, null, 2));
}

function printStep(step: string, details?: string): void {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] ${step}`);

  if (details) {
    console.log(details);
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function readTranscriptEvents(transcriptPath: string) {
  try {
    const content = await readFile(transcriptPath, "utf8");
    return parseTranscriptContent(content);
  } catch {
    return [];
  }
}

async function followTranscriptUntil<T>({
  label,
  transcriptPath,
  operation
}: {
  label: string;
  transcriptPath: string;
  operation: Promise<T>;
}): Promise<T> {
  const printedEventKeys = new Set<string>();
  let settled = false;

  const poller = (async () => {
    while (!settled) {
      const events = await readTranscriptEvents(transcriptPath);

      for (const event of events) {
        const eventKey = `${event.index}:${event.agentName}:${event.phase}:${event.status}`;

        if (printedEventKeys.has(eventKey)) {
          continue;
        }

        printedEventKeys.add(eventKey);
        printStep(
          `${label} -> ${event.agentName} [${event.phase}/${event.status}]`,
          event.summary
        );
      }

      await sleep(1000);
    }
  })();

  try {
    const result = await operation;
    settled = true;
    await poller;

    const finalEvents = await readTranscriptEvents(transcriptPath);
    for (const event of finalEvents) {
      const eventKey = `${event.index}:${event.agentName}:${event.phase}:${event.status}`;

      if (printedEventKeys.has(eventKey)) {
        continue;
      }

      printedEventKeys.add(eventKey);
      printStep(
        `${label} -> ${event.agentName} [${event.phase}/${event.status}]`,
        event.summary
      );
    }

    return result;
  } catch (error) {
    settled = true;
    await poller;
    throw error;
  }
}

function printOpenHints(urls: string[]): void {
  console.log("\n=== URLs Para Abrir Manualmente ===");

  for (const url of urls) {
    console.log(url);
  }
}

async function main(): Promise<void> {
  printStep("Verificando se a API esta no ar", baseUrl);
  await ensureApiIsUp();

  const runId = `demo-workflows-${Date.now()}`;
  printStep("Iniciando workflow1", `runId=${runId}`);
  const policyTranscriptPath = getTranscriptMasterFilePath({
    workflowType: "policy_calibration",
    runId
  });
  const policyResult = await followTranscriptUntil({
    label: "workflow1",
    transcriptPath: policyTranscriptPath,
    operation: fetchJson<CalibratePolicyResponse>("/api/policies/calibrate", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        runId,
        inputCsvPath: csvPath
      })
    })
  });
  printStep(
    "Workflow1 concluido",
    `policyVersion=${policyResult.publishedPolicy?.version ?? "-"}`
  );

  printStep("Criando caso de acordo para workflow2");
  const agreementCaseId = await createCase({
    externalCaseNumber: `CASE-AGR-${Date.now()}`,
    plaintiffName: "Maria da Silva",
    processType: "Nao reconhece operacao",
    uf: "MG",
    claimAmountCents: 1500000
  });
  printStep("Caso de acordo criado", `caseId=${agreementCaseId}`);

  printStep("Enviando documentos do caso de acordo");
  await uploadDocuments(agreementCaseId, [
    {
      docType: "autos",
      fileName: "autos.txt",
      textContent: "A autora nao reconhece a contratacao do emprestimo e alega fraude."
    },
    {
      docType: "extrato",
      fileName: "extrato.txt",
      textContent: "Extrato sem deposito identificado ou credito recebido."
    },
    {
      docType: "dossie",
      fileName: "dossie.txt",
      textContent: "Dossie inconclusivo e sem anexos suficientes."
    }
  ]);
  printStep("Documentos do caso de acordo enviados", `caseId=${agreementCaseId}`);

  printStep("Analisando caso de acordo");
  const agreementTranscriptPath = getTranscriptMasterFilePath({
    workflowType: "case_decision",
    caseId: agreementCaseId
  });
  const agreementAnalysis = await followTranscriptUntil({
    label: "workflow2/agreement",
    transcriptPath: agreementTranscriptPath,
    operation: analyzeCase(agreementCaseId)
  });
  printStep(
    "Analise do caso de acordo concluida",
    `analysisId=${agreementAnalysis.analysisId} action=${agreementAnalysis.decision.action}`
  );

  printStep("Registrando acao do advogado para caso de acordo");
  await registerLawyerAction(agreementCaseId, agreementAnalysis.analysisId, {
    chosenAction: "agreement",
    followedRecommendation: true,
    offeredValue: 2700,
    negotiationStatus: "accepted",
    negotiationValue: 2500,
    notes: "Acordo aceito apos recomendacao do sistema."
  });
  printStep("Acao do advogado registrada para caso de acordo", `caseId=${agreementCaseId}`);

  printStep("Criando caso de defesa para workflow2");
  const defenseCaseId = await createCase({
    externalCaseNumber: `CASE-DEF-${Date.now()}`,
    plaintiffName: "Joao de Souza",
    processType: "Nao reconhece operacao",
    uf: "MG",
    claimAmountCents: 400000
  });
  printStep("Caso de defesa criado", `caseId=${defenseCaseId}`);

  printStep("Enviando documentos do caso de defesa");
  await uploadDocuments(defenseCaseId, [
    {
      docType: "autos",
      fileName: "autos.txt",
      textContent: "Contestacao padrao do banco."
    },
    {
      docType: "contrato",
      fileName: "contrato.txt",
      textContent: "Contrato firmado em 12/01/2024 no valor de R$ 4.000,00."
    },
    {
      docType: "comprovante_credito",
      fileName: "credito.txt",
      textContent: "Comprovante de credito autenticado no valor de R$ 4.000,00."
    },
    {
      docType: "extrato",
      fileName: "extrato.txt",
      textContent: "Credito identificado em 12/01/2024 no valor de R$ 4.000,00."
    },
    {
      docType: "dossie",
      fileName: "dossie.txt",
      textContent: "Dossie favoravel e consistente."
    },
    {
      docType: "demonstrativo_divida",
      fileName: "divida.txt",
      textContent: "Demonstrativo de evolucao da divida apresentado."
    },
    {
      docType: "laudo_referenciado",
      fileName: "laudo.txt",
      textContent: "Laudo referenciado juntado."
    }
  ]);
  printStep("Documentos do caso de defesa enviados", `caseId=${defenseCaseId}`);

  printStep("Analisando caso de defesa");
  const defenseTranscriptPath = getTranscriptMasterFilePath({
    workflowType: "case_decision",
    caseId: defenseCaseId
  });
  const defenseAnalysis = await followTranscriptUntil({
    label: "workflow2/defense",
    transcriptPath: defenseTranscriptPath,
    operation: analyzeCase(defenseCaseId)
  });
  printStep(
    "Analise do caso de defesa concluida",
    `analysisId=${defenseAnalysis.analysisId} action=${defenseAnalysis.decision.action}`
  );

  printStep("Registrando acao do advogado para caso de defesa");
  await registerLawyerAction(defenseCaseId, defenseAnalysis.analysisId, {
    chosenAction: "defense",
    followedRecommendation: true,
    notes: "Defesa mantida."
  });
  printStep("Acao do advogado registrada para caso de defesa", `caseId=${defenseCaseId}`);

  printStep("Consultando dashboard");
  const summary = await fetchJson("/api/dashboard/summary");
  const adherence = await fetchJson("/api/dashboard/adherence");
  const effectiveness = await fetchJson("/api/dashboard/effectiveness");
  printStep("Dashboard consultado com sucesso");

  const policyViewerUrl = buildAbsoluteUrl(policyResult.traceViewerUrl);
  const agreementViewerUrl = buildAbsoluteUrl(agreementAnalysis.traceViewerUrl);
  const defenseViewerUrl = buildAbsoluteUrl(defenseAnalysis.traceViewerUrl);
  const urlsToOpen = [
    policyViewerUrl,
    agreementViewerUrl,
    defenseViewerUrl
  ].filter((url): url is string => Boolean(url));

  printOpenHints(urlsToOpen);

  printStep("Tentando abrir visualizacoes no navegador");
  await maybeOpenFront(policyViewerUrl);
  await maybeOpenFront(agreementViewerUrl);
  await maybeOpenFront(defenseViewerUrl);
  printStep("Fluxo demo finalizado");

  printSection("Workflow 1", {
    runId: policyResult.runId,
    policyVersion: policyResult.publishedPolicy?.version,
    policyStatus: policyResult.publishedPolicy?.status,
    traceViewerUrl: policyViewerUrl,
    traceJsonUrl: buildAbsoluteUrl(policyResult.traceJsonUrl)
  });

  printSection("Workflow 2 - Agreement", {
    caseId: agreementCaseId,
    analysisId: agreementAnalysis.analysisId,
    action: agreementAnalysis.decision.action,
    offerTarget: agreementAnalysis.decision.offerTarget,
    traceViewerUrl: agreementViewerUrl,
    traceJsonUrl: buildAbsoluteUrl(agreementAnalysis.traceJsonUrl)
  });

  printSection("Workflow 2 - Defense", {
    caseId: defenseCaseId,
    analysisId: defenseAnalysis.analysisId,
    action: defenseAnalysis.decision.action,
    traceViewerUrl: defenseViewerUrl,
    traceJsonUrl: buildAbsoluteUrl(defenseAnalysis.traceJsonUrl)
  });

  printSection("Dashboard Summary", summary);
  printSection("Dashboard Adherence", adherence);
  printSection("Dashboard Effectiveness", effectiveness);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Falha desconhecida ao rodar os workflows."
  );
  process.exitCode = 1;
});
