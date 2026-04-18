import type { SQLiteRepository } from "../repositories/SQLiteRepository.js";

export class StatusUseCase {
  constructor(private readonly sqliteRepository: SQLiteRepository) {}

  async getStatus(caseId: string) {
    const status = await this.sqliteRepository.getCaseStatus(caseId);

    return {
      caseId,
      status
    };
  }
}
