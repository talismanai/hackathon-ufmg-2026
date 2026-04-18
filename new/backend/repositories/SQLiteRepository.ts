import type {
  CaseDecisionState,
  CaseDocument,
  CaseRecord,
  DashboardSummary,
  LawyerActionInput,
  PolicyCalibrationState,
  StoredPolicy
} from "@grupo4/shared";

export type CreateCaseInput = {
  externalCaseNumber?: string;
  processType?: string;
  plaintiffName?: string;
  uf?: string;
  courtDistrict?: string;
  claimAmountCents?: number;
  input?: Record<string, unknown>;
};

export type AddCaseDocumentInput = {
  docType: CaseDocument["docType"];
  fileName: string;
  mimeType?: string;
  textContent: string;
  metadata?: Record<string, unknown>;
};

export type DashboardAnalytics = {
  summary: DashboardSummary;
  adherence: Awaited<ReturnType<SQLiteRepository["getDashboardAdherence"]>>;
  effectiveness: Awaited<ReturnType<SQLiteRepository["getDashboardEffectiveness"]>>;
};

export type CreateCaseFeedbackInput = {
  analysisId?: string;
  feedbackText: string;
  approvalStatus: "approved" | "rejected";
};

export type FeedbackSavingsSummary = {
  totalFeedbacks: number;
  approvedFeedbacks: number;
  rejectedFeedbacks: number;
  totalSavedCostBrl: number;
  items: Array<{
    id: string;
    caseId: string;
    analysisId: string;
    externalCaseNumber: string | null;
    aiRecommendation: string;
    approvalStatus: string;
    feedbackText: string;
    estimatedCauseValueBrl: number | null;
    createdAt: string;
  }>;
};

export interface SQLiteRepository {
  generatePolicy(input: {
    runId: string;
    inputCsvPath?: string;
    logsPath?: string;
  }): Promise<PolicyCalibrationState>;
  getLatestPolicy(): Promise<StoredPolicy | null>;
  getPolicyByVersion(version: string): Promise<StoredPolicy | null>;
  listPolicies(): Promise<StoredPolicy[]>;
  createCase(input: CreateCaseInput): Promise<CaseRecord>;
  getCaseById(caseId: string): Promise<CaseRecord | null>;
  getCaseByExternalCaseNumber(
    externalCaseNumber: string
  ): Promise<CaseRecord | null>;
  getCaseDocuments(caseId: string): Promise<CaseDocument[]>;
  addCaseDocuments(
    caseId: string,
    documents: AddCaseDocumentInput[]
  ): Promise<CaseDocument[]>;
  analyzeCase(input: {
    caseId: string;
    policyVersion?: string;
  }): Promise<CaseDecisionState>;
  registerLawyerAction(
    caseId: string,
    input: LawyerActionInput
  ): Promise<void>;
  createCaseFeedback(
    caseId: string,
    input: CreateCaseFeedbackInput
  ): Promise<FeedbackSavingsSummary["items"][number]>;
  getFeedbackSavingsSummary(): Promise<FeedbackSavingsSummary>;
  getDashboardSummary(): Promise<DashboardSummary>;
  getDashboardAdherence(): Promise<Record<string, unknown>>;
  getDashboardEffectiveness(): Promise<Record<string, unknown>>;
  getCaseStatus(caseId: string): Promise<string>;
}
