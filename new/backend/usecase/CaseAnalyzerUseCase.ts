import type { CaseDocument, CaseRecord } from "@grupo4/shared";

import { CaseAnalyzerAgent } from "../agents/CaseAnalyzer/CaseAnalyzerAgent.js";
import type { LocalStorageRepository } from "../repositories/LocalStorageRepository.js";
import type {
  AddCaseDocumentInput,
  CreateCaseInput,
  SQLiteRepository
} from "../repositories/SQLiteRepository.js";

export class CaseAnalyzerUseCase {
  constructor(
    private readonly caseAnalyzerAgent: CaseAnalyzerAgent,
    private readonly sqliteRepository: SQLiteRepository,
    private readonly localStorageRepository: LocalStorageRepository
  ) {}

  async submitDocuments(input: {
    caseId?: string;
    caseInput?: CreateCaseInput;
    policyVersion?: string;
    documents: AddCaseDocumentInput[];
  }): Promise<{
    caseRecord: CaseRecord;
    documents: CaseDocument[];
    localFiles: Awaited<ReturnType<LocalStorageRepository["saveTempFiles"]>>;
    analysis: Awaited<ReturnType<CaseAnalyzerAgent["execute"]>>;
  }> {
    const caseRecord =
      input.caseId
        ? await this.sqliteRepository.getCaseById(input.caseId)
        : input.caseInput
          ? await this.sqliteRepository.createCase(input.caseInput)
          : null;

    if (!caseRecord) {
      throw new Error("Caso nao encontrado e nenhum payload de criacao foi fornecido.");
    }

    const localFiles = await this.localStorageRepository.saveTempFiles(
      input.documents.map((document) => ({
        fileName: document.fileName,
        mimeType: document.mimeType,
        textContent: document.textContent,
        folder: caseRecord.id
      }))
    );

    const documents = await this.sqliteRepository.addCaseDocuments(
      caseRecord.id,
      input.documents.map((document, index) => ({
        ...document,
        metadata: {
          ...(document.metadata ?? {}),
          tempFilePath: localFiles[index]?.absolutePath
        }
      }))
    );

    const analysis = await this.caseAnalyzerAgent.execute({
      caseId: caseRecord.id,
      policyVersion: input.policyVersion
    });

    const latestCaseRecord =
      (await this.sqliteRepository.getCaseById(caseRecord.id)) ?? caseRecord;

    return {
      caseRecord: latestCaseRecord,
      documents,
      localFiles,
      analysis
    };
  }
}
