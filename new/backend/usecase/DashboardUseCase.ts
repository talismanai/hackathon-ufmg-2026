import type { SQLiteRepository } from "../repositories/SQLiteRepository.js";

export class DashboardUseCase {
  constructor(private readonly sqliteRepository: SQLiteRepository) {}

  async getAnalytics() {
    const [summary, adherence, effectiveness] = await Promise.all([
      this.sqliteRepository.getDashboardSummary(),
      this.sqliteRepository.getDashboardAdherence(),
      this.sqliteRepository.getDashboardEffectiveness()
    ]);

    return {
      summary,
      adherence,
      effectiveness
    };
  }
}
