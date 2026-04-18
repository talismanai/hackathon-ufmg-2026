import type { PolicyCalibrationState } from "@grupo4/shared";

import type { SQLiteRepository } from "../../repositories/SQLiteRepository.js";

export class PolicyGeneratorAgent {
  constructor(private readonly sqliteRepository: SQLiteRepository) {}

  async generate(input: {
    runId: string;
    inputCsvPath?: string;
    logsPath?: string;
  }): Promise<PolicyCalibrationState> {
    return this.sqliteRepository.generatePolicy(input);
  }
}
