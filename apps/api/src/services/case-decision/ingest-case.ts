import type { CaseDecisionState } from "@grupo4/shared";

import { getCaseById, getCaseDocuments } from "../../db/repositories/case-repository.js";
import {
  getActivePolicy,
  getPolicyByVersion
} from "../../db/repositories/policy-repository.js";
import { buildRawTextByDocType } from "../../lib/case-decision.js";

export async function ingestCase(
  caseId: string,
  requestedPolicyVersion?: string
): Promise<
  Pick<
    CaseDecisionState,
    "caseId" | "caseRecord" | "policyVersion" | "activePolicy" | "documents" | "rawTextByDocType"
  >
> {
  const [caseRecord, documents, policy] = await Promise.all([
    getCaseById(caseId),
    getCaseDocuments(caseId),
    requestedPolicyVersion
      ? getPolicyByVersion(requestedPolicyVersion)
      : getActivePolicy()
  ]);

  if (!caseRecord) {
    throw new Error("Caso nao encontrado.");
  }

  if (!policy) {
    throw new Error("Nenhuma policy publicada disponivel para analise.");
  }

  if (documents.length === 0) {
    throw new Error("O caso precisa ter ao menos um documento para analise.");
  }

  return {
    caseId,
    caseRecord,
    policyVersion: policy.version,
    activePolicy: policy,
    documents,
    rawTextByDocType: buildRawTextByDocType(documents)
  };
}
