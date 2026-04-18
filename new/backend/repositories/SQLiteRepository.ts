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
  getDashboardSummary(): Promise<DashboardSummary>;
  getDashboardAdherence(): Promise<Record<string, unknown>>;
  getDashboardEffectiveness(): Promise<Record<string, unknown>>;
  getCaseStatus(caseId: string): Promise<string>;
}
