import {
  addCaseDocuments,
  createCase,
  createLawyerAction,
  getCaseById,
  getCaseDocuments
} from "../db/repositories/case-repository.js";
import {
  getDashboardAdherence,
  getDashboardEffectiveness,
  getDashboardSummary
} from "../db/repositories/dashboard-repository.js";
import {
  getActivePolicy,
  getPolicyByVersion,
  listPolicies
} from "../db/repositories/policy-repository.js";
import { runCaseDecision } from "../graphs/case-decision-graph.js";
import { runPolicyCalibration } from "../graphs/policy-calibration-graph.js";
import type {
  AddCaseDocumentInput,
  CreateCaseInput,
  SQLiteRepository
} from "../repositories/SQLiteRepository.js";

export class SQLiteDataSource implements SQLiteRepository {
  async generatePolicy(input: {
    runId: string;
    inputCsvPath?: string;
    logsPath?: string;
  }) {
    return runPolicyCalibration(input);
  }

  async getLatestPolicy() {
    return getActivePolicy();
  }

  async getPolicyByVersion(version: string) {
    return getPolicyByVersion(version);
  }

  async listPolicies() {
    return listPolicies();
  }

  async createCase(input: CreateCaseInput) {
    return createCase(input);
  }

  async getCaseById(caseId: string) {
    return getCaseById(caseId);
  }

  async getCaseDocuments(caseId: string) {
    return getCaseDocuments(caseId);
  }

  async addCaseDocuments(caseId: string, documents: AddCaseDocumentInput[]) {
    return addCaseDocuments(caseId, documents);
  }

  async analyzeCase(input: { caseId: string; policyVersion?: string }) {
    return runCaseDecision(input);
  }

  async registerLawyerAction(caseId: string, input: Parameters<typeof createLawyerAction>[1]) {
    return createLawyerAction(caseId, input);
  }

  async getDashboardSummary() {
    return getDashboardSummary();
  }

  async getDashboardAdherence() {
    return getDashboardAdherence();
  }

  async getDashboardEffectiveness() {
    return getDashboardEffectiveness();
  }

  async getCaseStatus(caseId: string) {
    const caseRecord = await getCaseById(caseId);

    return caseRecord?.status ?? "not_found";
  }
}
