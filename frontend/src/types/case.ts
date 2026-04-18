export type AiVerdict = "agreement" | "litigation" | "undetermined";

export type LawyerDecision = "approved" | "disagreed" | "pending";

export type CaseStatus = "processing" | "completed" | "reviewed";

export type PriorityLevel = "Baixa" | "Média" | "Alta";

export type CaseCategory = "Cível" | "Trabalhista" | "Criminal" | "Tributário";

export type CaseComplexity = "Baixa" | "Média" | "Alta";

export type VerdictRecommendation = "Acordo" | "Defesa" | "Revisão";
export type ResultStatus = "pending" | "approved" | "rejected";

export interface AiTopic {
  id: string;
  title: string;
  description: string;
  lawyerDecision?: LawyerDecision;
}

export interface CaseMetadata {
  caseId: string;
  processNumber: string;
  clientName: string;
  vara: string;
  dataFato: string;
  verdictRecommendation: VerdictRecommendation;
  status: CaseStatus;
}

export interface CaseVerdict {
  recommendation: VerdictRecommendation;
  probability: number;
  similarCases: number;
  tetoSugerido?: number;
  explanationShort: string;
  detailedExplanation?: string;
}

export interface CaseResult {
  caseId: string;
  analysisId?: string;
  resultStatus: ResultStatus;
  processNumber: string;
  clientName: string;
  vara: string;
  dataFato: string;
  complexidade: CaseComplexity;
  verdict: CaseVerdict;
  topics: AiTopic[];
  generatedAt: string;
}
