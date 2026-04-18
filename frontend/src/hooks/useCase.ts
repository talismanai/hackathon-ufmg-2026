import {
  getCaseResult,
  searchCase,
  submitCase,
  type SubmitCasePayload,
} from "@/services/api";

export function useCase() {
  return {
    submitCase: (payload: SubmitCasePayload) => submitCase(payload),
    getCaseResult: (caseId: string) => getCaseResult(caseId),
    searchCase: (processNumber: string) => searchCase(processNumber),
  };
}
