import fs from "node:fs";

import type { HistoricalCaseRow } from "@grupo4/shared";
import { historicalCaseRowSchema } from "@grupo4/shared";

import { listHistoricalCases } from "../../db/repositories/historical-case-repository.js";
import { parseBrl, readCsvRows } from "../../lib/csv.js";
import { parseJson } from "../../lib/json.js";
import { toClaimAmountBand } from "../../lib/policy-calibration.js";

function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

export function normalizeHistoricalRow(row: {
  caseNumber: string;
  processType?: string | null;
  uf?: string | null;
  courtDistrict?: string | null;
  causeValueBrl: number;
  outcome: string;
  condemnationValueBrl: number;
  features: Record<string, unknown>;
  source: Record<string, unknown>;
}): HistoricalCaseRow {
  const contractPresent = toBoolean(row.features.contractPresent ?? row.features.contractProvided);
  const statementPresent = toBoolean(row.features.statementPresent ?? row.features.statementProvided);
  const creditProofPresent = toBoolean(
    row.features.creditProofPresent ?? row.features.creditProofProvided
  );
  const dossierPresent = toBoolean(row.features.dossierPresent ?? row.features.dossierProvided);
  const debtEvolutionPresent = toBoolean(
    row.features.debtEvolutionPresent ?? row.features.debtEvolutionProvided
  );
  const referenceReportPresent = toBoolean(
    row.features.referenceReportPresent ?? row.features.referencedReportProvided
  );
  const subsidyCount =
    Number(row.features.subsidyCount) ||
    [
      contractPresent,
      statementPresent,
      creditProofPresent,
      dossierPresent,
      debtEvolutionPresent,
      referenceReportPresent
    ].filter(Boolean).length;
  const causeValueBrl = Number(row.causeValueBrl) || 0;
  const condemnationValueBrl = Number(row.condemnationValueBrl) || 0;

  return historicalCaseRowSchema.parse({
    caseNumber: row.caseNumber,
    processType: row.processType ?? null,
    uf: row.uf ?? null,
    courtDistrict: row.courtDistrict ?? null,
    causeValueBrl,
    outcome: row.outcome,
    condemnationValueBrl,
    features: {
      contractPresent,
      statementPresent,
      creditProofPresent,
      dossierPresent,
      debtEvolutionPresent,
      referenceReportPresent,
      claimAmountBand: toClaimAmountBand(causeValueBrl),
      subsidyCount,
      hasFullDocumentation:
        subsidyCount >= 5 && contractPresent && creditProofPresent && dossierPresent,
      subject:
        typeof row.features.subject === "string" ? row.features.subject : undefined,
      subSubject:
        typeof row.features.subSubject === "string"
          ? row.features.subSubject
          : undefined,
      condemnationRatio:
        causeValueBrl > 0 ? condemnationValueBrl / causeValueBrl : undefined
    },
    source: row.source
  });
}

async function loadRowsFromDatabase(): Promise<HistoricalCaseRow[]> {
  const historicalCases = await listHistoricalCases();

  return historicalCases.map((historicalCase) =>
    normalizeHistoricalRow({
      caseNumber: historicalCase.caseNumber ?? historicalCase.id,
      processType: historicalCase.processType,
      uf: historicalCase.uf,
      courtDistrict: historicalCase.courtDistrict,
      causeValueBrl: historicalCase.causeValueBrl ?? 0,
      outcome: historicalCase.outcome,
      condemnationValueBrl: historicalCase.condemnationValueBrl ?? 0,
      features: parseJson<Record<string, unknown>>(historicalCase.featuresJson, {}),
      source: parseJson<Record<string, unknown>>(historicalCase.sourceJson, {
        source: "historical_cases"
      })
    })
  );
}

function loadRowsFromCsv(csvPath: string): HistoricalCaseRow[] {
  const rows = readCsvRows(csvPath).slice(1);

  return rows
    .filter((row) => row[0])
    .map((row) =>
      normalizeHistoricalRow({
        caseNumber: row[0] ?? "",
        uf: row[1] ?? null,
        processType: row[2] ?? null,
        causeValueBrl: parseBrl(row[6]),
        outcome: row[4] ?? "Nao informado",
        condemnationValueBrl: parseBrl(row[7]),
        features: {
          subject: row[2],
          subSubject: row[3],
          contractPresent: false,
          statementPresent: false,
          creditProofPresent: false,
          dossierPresent: false,
          debtEvolutionPresent: false,
          referenceReportPresent: false,
          subsidyCount: 0
        },
        source: {
          source: "csv_fallback",
          csvPath
        }
      })
    );
}

export async function loadHistoricalData(
  inputCsvPath?: string
): Promise<{ historicalRows: HistoricalCaseRow[]; warnings: string[] }> {
  const warnings: string[] = [];
  const rowsFromDatabase = await loadRowsFromDatabase();

  if (rowsFromDatabase.length > 0) {
    return {
      historicalRows: rowsFromDatabase,
      warnings
    };
  }

  if (!inputCsvPath || !fs.existsSync(inputCsvPath)) {
    throw new Error(
      "Nenhum historico encontrado em SQLite e inputCsvPath nao foi informado."
    );
  }

  warnings.push(
    "Historico carregado diretamente do CSV sem enriquecimento de subsidios; as regras ficarao menos discriminativas."
  );

  return {
    historicalRows: loadRowsFromCsv(inputCsvPath),
    warnings
  };
}
