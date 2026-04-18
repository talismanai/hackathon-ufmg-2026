import { z } from "zod";
import { tool } from "@langchain/core/tools";

import { getCaseById, getCaseDocuments } from "../db/repositories/case-repository.js";
import {
  getActivePolicy,
  getPolicyByVersion
} from "../db/repositories/policy-repository.js";
import { extractFactsFromDocuments } from "../lib/case-decision.js";
import { retrieveSimilarCases } from "../services/case-decision/retrieve-similar-cases.js";

const getCaseSnapshotInputSchema = z.object({
  caseId: z.string().min(1)
});

const getPolicySnapshotInputSchema = z.object({
  selection: z.enum(["active", "by_version"]),
  policyVersion: z.string()
});

const getSimilarCasesInputSchema = z.object({
  caseId: z.string().min(1)
});

export const getCaseSnapshotTool = tool(
  async ({ caseId }) => {
    const caseRecord = await getCaseById(caseId);

    if (!caseRecord) {
      return {
        found: false,
        message: "Caso nao encontrado."
      };
    }

    const documents = await getCaseDocuments(caseId);

    return {
      found: true,
      case: {
        id: caseRecord.id,
        externalCaseNumber: caseRecord.externalCaseNumber,
        processType: caseRecord.processType,
        plaintiffName: caseRecord.plaintiffName,
        uf: caseRecord.uf,
        courtDistrict: caseRecord.courtDistrict,
        claimAmountCents: caseRecord.claimAmountCents,
        status: caseRecord.status
      },
      documents: documents.map((document) => ({
        id: document.id,
        docType: document.docType,
        fileName: document.fileName,
        textContent: document.textContent
      }))
    };
  },
  {
    name: "get_case_snapshot",
    description:
      "Busca o snapshot completo do caso atual no banco, incluindo documentos carregados.",
    schema: getCaseSnapshotInputSchema
  }
);

export const getPolicySnapshotTool = tool(
  async ({ selection, policyVersion }) => {
    const policy =
      selection === "active"
        ? await getActivePolicy()
        : await getPolicyByVersion(policyVersion);

    if (!policy) {
      return {
        found: false,
        message: "Policy nao encontrada."
      };
    }

    return {
      found: true,
      policy: {
        policyId: policy.policyId,
        version: policy.version,
        name: policy.name,
        processType: policy.processType,
        status: policy.status,
        minOffer: policy.minOffer,
        maxOffer: policy.maxOffer,
        lawyerSummary: policy.lawyerSummary
      },
      rules: policy.rules.map((rule) => ({
        ruleKey: rule.ruleKey,
        action: rule.action,
        priority: rule.priority,
        conditionSummary: rule.conditionSummary,
        explanation: rule.explanation
      }))
    };
  },
  {
    name: "get_policy_snapshot",
    description:
      "Busca a policy ativa ou uma versao especifica da policy para ser usada na decisao.",
    schema: getPolicySnapshotInputSchema
  }
);

export const getSimilarCasesSnapshotTool = tool(
  async ({ caseId }) => {
    const caseRecord = await getCaseById(caseId);

    if (!caseRecord) {
      return {
        found: false,
        message: "Caso nao encontrado."
      };
    }

    const documents = await getCaseDocuments(caseId);
    const facts = extractFactsFromDocuments(documents);
    const similarCases = await retrieveSimilarCases(caseRecord, facts);

    return {
      found: true,
      facts,
      similarCases
    };
  },
  {
    name: "get_similar_cases_snapshot",
    description:
      "Calcula um resumo de casos historicamente similares para o caso atual a partir do banco SQLite.",
    schema: getSimilarCasesInputSchema
  }
);

export const caseDecisionTools = [
  getCaseSnapshotTool,
  getPolicySnapshotTool,
  getSimilarCasesSnapshotTool
];
