import { spawn } from "node:child_process";
import path from "node:path";

type PolicyResponse = {
  runId: string;
  traceViewerUrl?: string;
  traceJsonUrl?: string;
  publishedPolicy?: {
    version: string;
    status: string;
  } | null;
  errors: string[];
};

type SubmitResponse = {
  caseId: string;
  analysisId: string | null;
  traceViewerUrl?: string;
  traceJsonUrl?: string;
  decision?: {
    action: string;
    offerTarget?: number;
  } | null;
  errors: string[];
};

const baseUrl =
  process.env.NEW_BACKEND_BASE_URL ??
  `http://127.0.0.1:${process.env.NEW_BACKEND_PORT ?? "3001"}`;
const shouldOpenFronts =
  process.env.OPEN_TRACE_VIEWS !== "false" && !process.argv.includes("--no-open");
const csvPath =
  process.env.DEMO_INPUT_CSV_PATH ??
  path.resolve(
    process.cwd(),
    "Cópia de Hackaton_Enter_Base_Candidatos.xlsx - Resultados dos processos.csv"
  );

function printStep(step: string, details?: string) {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] ${step}`);
  if (details) {
    console.log(details);
  }
}

function printSection(title: string, payload: unknown) {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(payload, null, 2));
}

function buildAbsoluteUrl(relativeOrAbsoluteUrl: string | undefined): string | undefined {
  if (!relativeOrAbsoluteUrl) {
    return undefined;
  }

  if (
    relativeOrAbsoluteUrl.startsWith("http://") ||
    relativeOrAbsoluteUrl.startsWith("https://")
  ) {
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

async function ensureApiIsUp() {
  const response = await fetch(new URL("/health", `${baseUrl}/`));

  if (!response.ok) {
    throw new Error(`New backend indisponivel em ${baseUrl}.`);
  }
}

function openUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "cmd"
          : "xdg-open";
    const args =
      process.platform === "darwin"
        ? [url]
        : process.platform === "win32"
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

async function maybeOpenFront(url: string | undefined) {
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

async function main() {
  printStep("Verificando se o new backend esta no ar", baseUrl);
  await ensureApiIsUp();

  const runId = `new-demo-${Date.now()}`;
  printStep("Iniciando workflow1 no new backend", `runId=${runId}`);
  const policyResponse = await fetchJson<PolicyResponse>("/api/policy-generator/generate", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      runId,
      inputCsvPath: csvPath
    })
  });

  printStep(
    "Workflow1 do new backend concluido",
    `policyVersion=${policyResponse.publishedPolicy?.version ?? "-"}`
  );

  printStep("Executando workflow2 de acordo no new backend");
  const agreementResponse = await fetchJson<SubmitResponse>("/api/case-analyzer/submit", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      caseInput: {
        externalCaseNumber: `NEW-CASE-AGR-${Date.now()}`,
        plaintiffName: "Maria da Silva",
        processType: "Nao reconhece operacao",
        uf: "MG",
        claimAmountCents: 1500000
      },
      documents: [
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
      ]
    })
  });

  printStep(
    "Workflow2 de acordo concluido",
    `caseId=${agreementResponse.caseId} action=${agreementResponse.decision?.action ?? "-"}`
  );

  printStep("Executando workflow2 de defesa no new backend");
  const defenseResponse = await fetchJson<SubmitResponse>("/api/case-analyzer/submit", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      caseInput: {
        externalCaseNumber: `NEW-CASE-DEF-${Date.now()}`,
        plaintiffName: "Joao de Souza",
        processType: "Nao reconhece operacao",
        uf: "MG",
        claimAmountCents: 400000
      },
      documents: [
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
      ]
    })
  });

  printStep(
    "Workflow2 de defesa concluido",
    `caseId=${defenseResponse.caseId} action=${defenseResponse.decision?.action ?? "-"}`
  );

  printStep("Consultando analytics do new backend");
  const analytics = await fetchJson("/api/dashboard/analytics");
  const agreementViewerUrl = buildAbsoluteUrl(agreementResponse.traceViewerUrl);
  const defenseViewerUrl = buildAbsoluteUrl(defenseResponse.traceViewerUrl);
  const policyViewerUrl = buildAbsoluteUrl(policyResponse.traceViewerUrl);

  await maybeOpenFront(policyViewerUrl);
  await maybeOpenFront(agreementViewerUrl);
  await maybeOpenFront(defenseViewerUrl);

  printSection("New Workflow 1", policyResponse);
  printSection("New Workflow 2 - Agreement", agreementResponse);
  printSection("New Workflow 2 - Defense", defenseResponse);
  printSection("New Dashboard Analytics", analytics);
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Falha desconhecida ao rodar os workflows do new backend."
  );
  process.exitCode = 1;
});
