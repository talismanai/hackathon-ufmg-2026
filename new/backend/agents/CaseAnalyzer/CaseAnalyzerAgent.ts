import type { CaseDecisionState, CaseRecord, StoredPolicy } from "@grupo4/shared";

import type { SQLiteRepository } from "../../repositories/SQLiteRepository.js";

export class CaseAnalyzerAgent {
  constructor(private readonly sqliteRepository: SQLiteRepository) {}

  async loadContext(input: {
    caseId: string;
    policyVersion?: string;
  }): Promise<{
    policy: StoredPolicy;
    caseRecord: CaseRecord;
  }> {
    const [caseRecord, policy] = await Promise.all([
      this.sqliteRepository.getCaseById(input.caseId),
      input.policyVersion
        ? this.sqliteRepository.getPolicyByVersion(input.policyVersion)
        : this.sqliteRepository.getLatestPolicy()
    ]);

    if (!caseRecord) {
      throw new Error("Caso nao encontrado para analise.");
    }

    if (!policy) {
      throw new Error("Nenhuma policy disponivel para analise.");
    }

    return {
      policy,
      caseRecord
    };
  }

  async execute(input: {
    caseId: string;
    policyVersion?: string;
  }): Promise<CaseDecisionState> {
    await this.loadContext(input);

    return this.sqliteRepository.analyzeCase(input);
  }
}
