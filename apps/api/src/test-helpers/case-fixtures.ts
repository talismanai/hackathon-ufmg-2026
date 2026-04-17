import type {
  CaseDocument,
  CaseRecord,
  StoredPolicy
} from "@grupo4/shared";

export function makeCaseRecord(
  overrides: Partial<CaseRecord> = {}
): CaseRecord {
  return {
    id: "case-fixture",
    status: "new",
    claimAmountCents: 1200000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    documents: [],
    ...overrides
  };
}

export function makePolicy(overrides: Partial<StoredPolicy> = {}): StoredPolicy {
  return {
    policyId: "policy-fixture",
    version: "policy-v1",
    name: "Fixture Policy",
    processType: "Nao reconhece operacao",
    status: "published",
    minOffer: 500,
    maxOffer: 20000,
    config: {},
    rules: [
      {
        ruleKey: "policy_missing_credit_proof",
        priority: 10,
        title: "Sem comprovante de credito",
        conditionSummary: "creditProofPresent = false",
        conditionJson: {
          all: [
            {
              field: "creditProofPresent",
              operator: "eq",
              value: false
            },
            {
              field: "claimAmountBand",
              operator: "eq",
              value: "high"
            }
          ]
        },
        action: "agreement",
        offerMinFactor: 0.5,
        offerTargetFactor: 0.65,
        offerMaxFactor: 0.75,
        explanation: "Casos altos sem comprovante tendem a acordo."
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    ...overrides
  };
}

export function makeDocument(
  docType: CaseDocument["docType"],
  textContent: string,
  overrides: Partial<CaseDocument> = {}
): CaseDocument {
  return {
    id: `${docType}-fixture`,
    caseId: "case-fixture",
    docType,
    fileName: `${docType}.txt`,
    mimeType: "text/plain",
    textContent,
    ...overrides
  };
}
