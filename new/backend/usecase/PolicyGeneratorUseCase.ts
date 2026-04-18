import { PolicyCritiqueAgent } from "../agents/PolicyGenerator/PolicyCritiqueAgent.js";
import { PolicyGeneratorAgent } from "../agents/PolicyGenerator/PolicyGeneratorAgent.js";

export class PolicyGeneratorUseCase {
  constructor(
    private readonly policyGeneratorAgent: PolicyGeneratorAgent,
    private readonly policyCritiqueAgent: PolicyCritiqueAgent = new PolicyCritiqueAgent()
  ) {}

  async execute(input: {
    runId: string;
    inputCsvPath?: string;
    logsPath?: string;
  }) {
    const state = await this.policyGeneratorAgent.generate(input);

    return {
      state,
      summary: this.policyCritiqueAgent.summarizeCalibration(state)
    };
  }
}
