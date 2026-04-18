import type {
  CaseCategory,
  CaseMetadata,
  CaseResult,
  PriorityLevel,
  VerdictRecommendation,
} from "@/types/case";

interface MockCaseSeed {
  caseId: string;
  processNumber: string;
  clientName: string;
  vara: string;
  dataFato: string;
  complexidade: "Baixa" | "Média" | "Alta";
  advogado: {
    name: string;
    initials: string;
  };
  verdict: {
    recommendation: VerdictRecommendation;
    probability: number;
    similarCases: number;
    tetoSugerido?: number;
  };
  topics: Array<{
    id: string;
    title: string;
    description: string;
  }>;
  generatedAt: string;
  status: "processing" | "completed" | "reviewed";
}

export interface SubmitCasePayload {
  processNumber: string;
  clientName?: string;
  category?: CaseCategory;
  priority?: PriorityLevel;
  files: File[];
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const mockCases: MockCaseSeed[] = [
  {
    caseId: "case-2418A",
    processNumber: "0801234-56.2024.8.10.0001",
    clientName: "Maria de Lourdes Silva",
    vara: "12ª Vara Cível de Belo Horizonte",
    dataFato: "2025-01-12",
    complexidade: "Média",
    advogado: {
      name: "Fernanda Costa",
      initials: "FC",
    },
    verdict: {
      recommendation: "Acordo",
      probability: 0.72,
      similarCases: 214,
      tetoSugerido: 18750,
    },
    topics: [
      {
        id: "prescricional",
        title: "Validade Prescricional",
        description:
          "Os documentos indicam que não houve lapso suficiente para reconhecimento de prescrição, mantendo a discussão concentrada na origem da contratação e nos descontos realizados.",
      },
      {
        id: "probatoria",
        title: "Robustez Probatória do Banco",
        description:
          "Contrato, comprovante de crédito e laudo referenciado formam um conjunto documental consistente, mas a ausência de biometria reforça a recomendação de composição monitorada.",
      },
      {
        id: "jurisprudencia",
        title: "Jurisprudência Local Aplicável",
        description:
          "Na comarca analisada, casos com documentação parcial semelhante têm apresentado condenações moderadas, com maior previsibilidade econômica em acordos dentro do teto sugerido.",
      },
    ],
    generatedAt: "2026-04-17T21:15:00.000Z",
    status: "completed",
  },
  {
    caseId: "case-8831B",
    processNumber: "0654321-09.2024.8.04.0001",
    clientName: "João Batista Pereira",
    vara: "4ª Vara Cível de Contagem",
    dataFato: "2024-11-03",
    complexidade: "Alta",
    advogado: {
      name: "Carlos Moura",
      initials: "CM",
    },
    verdict: {
      recommendation: "Defesa",
      probability: 0.39,
      similarCases: 176,
    },
    topics: [
      {
        id: "assinatura",
        title: "Autenticidade da Assinatura",
        description:
          "A documentação apresentada inclui dossiê de autenticidade e convergência entre dados cadastrais, fortalecendo a linha defensiva quanto à legitimidade da contratação.",
      },
      {
        id: "fluxo-credito",
        title: "Rastreamento do Crédito",
        description:
          "O comprovante de crédito bancário e a evolução da dívida demonstram materialidade financeira compatível com a contratação questionada.",
      },
      {
        id: "tendencia",
        title: "Tendência Decisória da Vara",
        description:
          "A vara possui histórico favorável ao réu quando há rastreamento completo da contratação, reduzindo o risco residual de condenação.",
      },
    ],
    generatedAt: "2026-04-16T18:05:00.000Z",
    status: "reviewed",
  },
  {
    caseId: "case-5502C",
    processNumber: "0712456-14.2025.8.13.0024",
    clientName: "Ana Carolina Ribeiro",
    vara: "3ª Vara Cível de Juiz de Fora",
    dataFato: "2025-02-21",
    complexidade: "Baixa",
    advogado: {
      name: "Bruna Teixeira",
      initials: "BT",
    },
    verdict: {
      recommendation: "Acordo",
      probability: 0.81,
      similarCases: 132,
      tetoSugerido: 9400,
    },
    topics: [
      {
        id: "desconto",
        title: "Regularidade dos Descontos",
        description:
          "Há divergência entre a data do primeiro desconto e a comunicação prévia ao cliente, ampliando o risco reputacional e financeiro em eventual litígio.",
      },
      {
        id: "canal",
        title: "Canal de Contratação",
        description:
          "O canal remoto utilizado no caso possui histórico de maior contestação e menor conversão probatória, sugerindo acordo preventivo.",
      },
      {
        id: "valoracao",
        title: "Faixa Econômica de Encerramento",
        description:
          "Casos semelhantes encerrados por acordo nesta jurisdição convergiram para uma faixa de pagamento inferior ao custo médio de condenação.",
      },
    ],
    generatedAt: "2026-04-15T14:42:00.000Z",
    status: "completed",
  },
];

function cloneCase(seed: MockCaseSeed): CaseResult {
  return {
    caseId: seed.caseId,
    processNumber: seed.processNumber,
    clientName: seed.clientName,
    vara: seed.vara,
    dataFato: seed.dataFato,
    complexidade: seed.complexidade,
    advogado: seed.advogado,
    verdict: seed.verdict,
    topics: seed.topics,
    generatedAt: seed.generatedAt,
  };
}

function cloneMetadata(seed: MockCaseSeed): CaseMetadata {
  return {
    caseId: seed.caseId,
    processNumber: seed.processNumber,
    clientName: seed.clientName,
    vara: seed.vara,
    dataFato: seed.dataFato,
    verdictRecommendation: seed.verdict.recommendation,
    status: seed.status,
  };
}

function normalizeProcessNumber(value: string) {
  return value.replace(/\D/g, "");
}

function buildGeneratedCase(payload: SubmitCasePayload): CaseResult {
  const random = Math.floor(Math.random() * 9000) + 1000;
  const caseId = `case-${random}N`;
  const processNumber =
    payload.processNumber || "0000000-00.0000.0.00.0000";
  const recommendation: VerdictRecommendation =
    payload.priority === "Alta" ? "Defesa" : "Acordo";

  return {
    caseId,
    processNumber,
    clientName: payload.clientName?.trim() || "Cliente não informado",
    vara: "8ª Vara Cível de Belo Horizonte",
    dataFato: "2026-04-17",
    complexidade: payload.priority === "Alta" ? "Alta" : "Média",
    advogado: {
      name: "Equipe Jurídica Banco UFMG",
      initials: "BU",
    },
    verdict: {
      recommendation,
      probability: recommendation === "Acordo" ? 0.68 : 0.44,
      similarCases: 97,
      tetoSugerido: recommendation === "Acordo" ? 12450 : undefined,
    },
    topics: [
      {
        id: "triagem-documental",
        title: "Triagem Documental Inicial",
        description:
          "Os arquivos enviados foram classificados e vinculados ao processo, permitindo análise estruturada dos autos e subsídios bancários.",
      },
      {
        id: "aderencia-politica",
        title: "Aderência à Política Vigente",
        description:
          "A priorização informada e o conjunto documental apontam compatibilidade com a política operacional atualmente ativa para a carteira cível.",
      },
      {
        id: "risco-financeiro",
        title: "Estimativa de Risco Financeiro",
        description:
          "A projeção inicial considera histórico de casos semelhantes e sugere faixa de encerramento economicamente vantajosa para o banco.",
      },
    ],
    generatedAt: new Date().toISOString(),
  };
}

export async function submitCase(
  payload: SubmitCasePayload,
): Promise<{ caseId: string }> {
  console.log("submitCase(payload)", payload);
  await delay(900);

  const generated = buildGeneratedCase(payload);
  mockCases.unshift({
    ...generated,
    status: "processing",
  });

  return { caseId: generated.caseId };
}

export async function getCaseResult(caseId: string): Promise<CaseResult> {
  console.log("getCaseResult(caseId)", caseId);
  await delay(650);

  const existing = mockCases.find((item) => item.caseId === caseId);

  if (existing) {
    return cloneCase(existing);
  }

  const fallback = buildGeneratedCase({
    processNumber: "0801234-56.2024.8.10.0001",
    clientName: "Processo em Triagem",
    category: "Cível",
    priority: "Média",
    files: [],
  });

  return {
    ...fallback,
    caseId,
  };
}

export async function searchCase(
  processNumber: string,
): Promise<CaseMetadata | null> {
  console.log("searchCase(processNumber)", processNumber);
  await delay(800);

  const normalizedInput = normalizeProcessNumber(processNumber);
  const found = mockCases.find(
    (item) =>
      normalizeProcessNumber(item.processNumber) === normalizedInput,
  );

  return found ? cloneMetadata(found) : null;
}
