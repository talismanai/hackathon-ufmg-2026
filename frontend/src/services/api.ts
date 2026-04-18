import { API_BASE_URL } from "@/config/env";
import type {
  AiTopic,
  CaseCategory,
  CaseMetadata,
  CaseResult,
  PriorityLevel,
  VerdictRecommendation,
} from "@/types/case";

export interface SubmitCasePayload {
  processNumber: string;
  clientName?: string;
  category?: CaseCategory;
  priority?: PriorityLevel;
  claimAmountCents: number;
  files: File[];
}

interface BackendStatusResponse {
  caseId?: string;
  status?: string;
}

interface BackendSubmitResponse {
  caseId?: string;
}

interface BackendCaseRecord {
  externalCaseNumber?: string;
  plaintiffName?: string;
  uf?: string;
  courtDistrict?: string;
  createdAt?: string;
}

interface BackendDecision {
  action?: string;
  confidence?: number;
  offerMin?: number;
  offerTarget?: number;
  offerMax?: number;
  expectedJudicialCost?: number;
  expectedCondemnation?: number;
  lossProbability?: number;
  explanationShort?: string;
}

interface BackendRisk {
  lossProbability?: number;
  riskBand?: string;
}

interface BackendSimilarCases {
  sampleSize?: number;
}

interface BackendAnalysis {
  similarCases?: BackendSimilarCases | null;
  risk?: BackendRisk | null;
  explanationShort?: string | null;
  explanationText?: string | null;
  offerMaxCents?: number | null;
}

interface BackendCaseResultResponse {
  caseId: string;
  analysisId?: string;
  caseStatus?: string;
  latestFeedbackApprovalStatus?: string | null;
  caseRecord?: BackendCaseRecord;
  analysis?: BackendAnalysis;
  decision?: BackendDecision;
  lawyerExplanation?: string;
}

interface BackendSearchCaseResponse {
  caseId: string;
  processNumber: string;
  clientName: string;
  vara: string;
  dataFato: string;
  verdictRecommendation?: string;
  status?: string;
}

function isReadyCaseStatus(status?: string) {
  return (
    status === "analyzed" ||
    status === "actioned" ||
    status === "completed" ||
    status === "reviewed"
  );
}

export interface SubmitCaseFeedbackPayload {
  analysisId?: string;
  feedbackText: string;
  approvalStatus: "approved" | "rejected";
}

class ApiError extends Error {
  status: number;

  constructor(status: number) {
    super(`${status}`);
    this.name = "ApiError";
    this.status = status;
  }
}

function buildUrl(pathname: string, params?: Record<string, string>) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;

  if (API_BASE_URL === "/" || API_BASE_URL === "") {
    const searchParams = new URLSearchParams(params);
    return searchParams.toString()
      ? `${normalizedPath}?${searchParams.toString()}`
      : normalizedPath;
  }

  const baseUrl = API_BASE_URL.endsWith("/")
    ? API_BASE_URL
    : `${API_BASE_URL}/`;
  const url = new URL(normalizedPath.slice(1), baseUrl);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  return url.toString();
}

async function readResponseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new ApiError(response.status);
  }

  return (await response.json()) as T;
}

async function requestJson<T>(
  pathname: string,
  init?: RequestInit,
  params?: Record<string, string>,
): Promise<T> {
  const response = await fetch(buildUrl(pathname, params), init);
  return readResponseJson<T>(response);
}

async function getCaseStatus(caseId: string): Promise<BackendStatusResponse> {
  return requestJson<BackendStatusResponse>("/api/status", undefined, { caseId });
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };

    reader.onerror = () => resolve("");
    reader.onabort = () => resolve("");

    try {
      reader.readAsText(file);
    } catch {
      resolve("");
    }
  });
}

function normalizeRecommendation(
  recommendation: string | undefined,
): VerdictRecommendation {
  if (recommendation === "agreement" || recommendation === "Acordo") {
    return "Acordo";
  }

  if (recommendation === "review" || recommendation === "Revisão") {
    return "Revisão";
  }

  return "Defesa";
}

function toFiniteNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mapRiskBandToComplexity(riskBand?: string): CaseResult["complexidade"] {
  if (riskBand === "high") {
    return "Alta";
  }

  if (riskBand === "medium") {
    return "Média";
  }

  return "Baixa";
}

function getPrimaryExplanation(response: BackendCaseResultResponse) {
  return (
    response.decision?.explanationShort?.trim() ||
    response.analysis?.explanationShort?.trim() ||
    response.lawyerExplanation?.trim() ||
    "A recomendação foi gerada a partir da análise automatizada do caso e dos documentos processados."
  );
}

function getDetailedExplanation(response: BackendCaseResultResponse) {
  const paragraphs = (response.lawyerExplanation ?? response.analysis?.explanationText ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length <= 1) {
    return undefined;
  }

  return paragraphs[1];
}

function mapResultStatus(
  caseStatus?: string,
  latestFeedbackApprovalStatus?: string | null,
): CaseResult["resultStatus"] {
  if (latestFeedbackApprovalStatus === "approved") {
    return "approved";
  }

  if (latestFeedbackApprovalStatus === "rejected") {
    return "rejected";
  }

  if (caseStatus === "actioned") {
    return "approved";
  }

  return "pending";
}

function sanitizeTopicTitle(value: string, index: number) {
  const cleaned = value
    .replace(/^\d+[.)-]?\s*/, "")
    .replace(/\s*[:-]\s*$/, "")
    .trim();

  if (!cleaned || cleaned.length > 80) {
    return `Tópico ${index + 1}`;
  }

  return cleaned;
}

export function parseTopicsFromExplanation(text: string): AiTopic[] {
  const normalized = text.trim().replace(/\r\n/g, "\n");

  if (!normalized) {
    return [
      {
        id: "geral",
        title: "Análise Geral",
        description: text,
      },
    ];
  }

  let sections = normalized
    .split(/\n\s*\n+/)
    .map((section) => section.trim())
    .filter(Boolean);

  if (sections.length <= 1) {
    sections = normalized
      .split(/(?=^\s*\d+[.)-]?\s+)/gm)
      .map((section) => section.trim())
      .filter(Boolean);
  }

  if (sections.length === 0) {
    return [
      {
        id: "geral",
        title: "Análise Geral",
        description: text,
      },
    ];
  }

  return sections.map((section, index) => {
    const lines = section
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const firstLine = lines[0] ?? "";
    const remainingText = lines.slice(1).join(" ").trim();

    return {
      id: `topic-${index + 1}`,
      title: sanitizeTopicTitle(firstLine, index),
      description:
        remainingText ||
        section.replace(/^\d+[.)-]?\s*/, "").trim() ||
        text,
    };
  });
}

function mapBackendResultToCaseResult(
  caseId: string,
  response: BackendCaseResultResponse,
): CaseResult {
  const probability = toFiniteNumber(
    response.decision?.lossProbability ?? response.analysis?.risk?.lossProbability,
    0,
  );
  const similarCases = toFiniteNumber(
    response.analysis?.similarCases?.sampleSize,
    0,
  );
  const recommendation = normalizeRecommendation(response.decision?.action);
  const tetoSugerido =
    typeof response.decision?.offerMax === "number"
      ? response.decision.offerMax
      : typeof response.analysis?.offerMaxCents === "number"
        ? response.analysis.offerMaxCents / 100
        : undefined;

  return {
    caseId: response.caseId,
    analysisId: response.analysisId,
    resultStatus: mapResultStatus(
      response.caseStatus,
      response.latestFeedbackApprovalStatus,
    ),
    processNumber: response.caseRecord?.externalCaseNumber ?? caseId,
    clientName: response.caseRecord?.plaintiffName ?? "—",
    vara: response.caseRecord?.courtDistrict ?? response.caseRecord?.uf ?? "—",
    dataFato: response.caseRecord?.createdAt ?? new Date().toISOString(),
    complexidade: mapRiskBandToComplexity(response.analysis?.risk?.riskBand),
    verdict: {
      recommendation,
      probability,
      similarCases,
      tetoSugerido: recommendation === "Acordo" ? tetoSugerido : undefined,
      explanationShort: getPrimaryExplanation(response),
      detailedExplanation: getDetailedExplanation(response),
    },
    topics: parseTopicsFromExplanation(response.lawyerExplanation ?? ""),
    generatedAt: new Date().toISOString(),
  };
}

export async function submitCase(
  payload: SubmitCasePayload,
): Promise<{ caseId: string }> {
  const documents = await Promise.all(
    payload.files.map(async (file) => ({
      docType: "autos",
      fileName: file.name,
      textContent: await readFileAsText(file),
    })),
  );

  const response = await requestJson<BackendSubmitResponse>(
    "/api/case-analyzer/submit",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        caseInput: {
          externalCaseNumber: payload.processNumber,
          plaintiffName: payload.clientName ?? "",
          processType: "Nao reconhece operacao",
          uf: "MG",
          claimAmountCents: payload.claimAmountCents,
        },
        documents,
      }),
    },
  );

  if (!response.caseId) {
    throw new Error("Resposta inválida do backend");
  }

  return { caseId: response.caseId };
}

export async function submitCaseFeedback(
  caseId: string,
  payload: SubmitCaseFeedbackPayload,
): Promise<void> {
  await requestJson(
    `/api/case-feedback/${caseId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
}

export async function waitForCaseAnalysis(caseId: string): Promise<void> {
  const maxRetries = 30;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const statusResponse = await getCaseStatus(caseId);

    if (statusResponse.status === "analyzed") {
      return;
    }

    await delay(2000);
  }

  throw new Error("Tempo limite excedido para processamento do caso");
}

export async function getCaseResult(caseId: string): Promise<CaseResult> {
  const maxRetries = 30;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const statusResponse = await getCaseStatus(caseId);

      if (statusResponse.status === "not_found") {
        throw new Error("Caso não encontrado");
      }

      if (isReadyCaseStatus(statusResponse.status)) {
        try {
          const resultResponse = await requestJson<BackendCaseResultResponse>(
            "/api/case-analyzer/result",
            undefined,
            { caseId },
          );

          return mapBackendResultToCaseResult(caseId, resultResponse);
        } catch (error) {
          if (error instanceof ApiError && error.status === 409) {
            await delay(2000);
            continue;
          }

          if (error instanceof ApiError && error.status === 404) {
            throw new Error("Caso não encontrado");
          }

          throw error;
        }
      }

      await delay(2000);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        throw new Error("Caso não encontrado");
      }

      throw error;
    }
  }

  throw new Error("Tempo limite excedido para processamento do caso");
}

export async function searchCase(
  processNumber: string,
): Promise<CaseMetadata | null> {
  try {
    const response = await requestJson<BackendSearchCaseResponse>(
      "/api/case-analyzer/search",
      undefined,
      { processNumber },
    );

    return {
      caseId: response.caseId,
      processNumber: response.processNumber,
      clientName: response.clientName || "—",
      vara: response.vara || "—",
      dataFato: response.dataFato || "—",
      verdictRecommendation: normalizeRecommendation(
        response.verdictRecommendation,
      ),
      status: isReadyCaseStatus(response.status) ? "completed" : "processing",
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }

    throw error;
  }
}

export async function getDashboardAnalytics(): Promise<unknown | null> {
  try {
    return await requestJson<unknown>("/api/dashboard/analytics");
  } catch (error) {
    console.error("Erro ao buscar analytics do dashboard", error);
    return null;
  }
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await requestJson<{ status?: string }>("/health");
    return response.status === "ok";
  } catch {
    return false;
  }
}
