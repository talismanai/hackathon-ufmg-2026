import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

const prisma = new PrismaClient();

const defaultSubsidiesCsv = path.join(
  rootDir,
  "Cópia de Hackaton_Enter_Base_Candidatos.xlsx - Subsídios disponibilizados.csv"
);
const defaultOutcomesCsv = path.join(
  rootDir,
  "Cópia de Hackaton_Enter_Base_Candidatos.xlsx - Resultados dos processos.csv"
);

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === "\"") {
      const next = line[i + 1];
      if (inQuotes && next === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function readCsvRows(csvPath) {
  const raw = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map(parseCsvLine);
}

function parseBrlToCents(value) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  if (!normalized) {
    return 0;
  }
  return Math.round(Number.parseFloat(normalized) * 100);
}

function readSubsidies(csvPath) {
  const rows = readCsvRows(csvPath).slice(2);
  return rows.map((row) => ({
    processNumber: row[0],
    contractProvided: row[1] === "1",
    statementProvided: row[2] === "1",
    creditProofProvided: row[3] === "1",
    dossierProvided: row[4] === "1",
    debtEvolutionProvided: row[5] === "1",
    referencedReportProvided: row[6] === "1"
  }));
}

function readOutcomes(csvPath) {
  const rows = readCsvRows(csvPath).slice(1);
  return rows.map((row) => ({
    processNumber: row[0],
    uf: row[1],
    processType: row[2],
    subject: row[2],
    subSubject: row[3],
    resultMacro: row[4],
    resultMicro: row[5],
    claimAmountCents: parseBrlToCents(row[6]),
    condemnationAmountCents: parseBrlToCents(row[7])
  }));
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function createManyInChunks(model, data, batchSize = 1000) {
  for (const batch of chunk(data, batchSize)) {
    await model.createMany({ data: batch });
  }
}

async function createAnalyticalViews() {
  await prisma.$executeRawUnsafe(`
    CREATE VIEW IF NOT EXISTS vw_case_outcome_summary AS
    SELECT
      uf,
      sub_subject,
      result_macro,
      COUNT(*) AS total_cases,
      AVG(condemnation_amount_brl) AS avg_condemnation_brl,
      AVG(condemnation_ratio) AS avg_condemnation_ratio,
      AVG(subsidy_count) AS avg_subsidy_count
    FROM process_case_features
    GROUP BY uf, sub_subject, result_macro
  `);

  await prisma.$executeRawUnsafe(`
    CREATE VIEW IF NOT EXISTS vw_subsidy_patterns AS
    SELECT
      contract_provided,
      statement_provided,
      credit_proof_provided,
      dossier_provided,
      debt_evolution_provided,
      referenced_report_provided,
      COUNT(*) AS total_cases,
      AVG(condemnation_amount_brl) AS avg_condemnation_brl,
      AVG(CASE WHEN result_macro = 'Êxito' THEN 1.0 ELSE 0.0 END) AS success_rate
    FROM process_case_features
    GROUP BY
      contract_provided,
      statement_provided,
      credit_proof_provided,
      dossier_provided,
      debt_evolution_provided,
      referenced_report_provided
  `);
}

function buildCaseFeatures(subsidiesByProcess, outcomesByProcess) {
  const processNumbers = [...subsidiesByProcess.keys()].filter((processNumber) =>
    outcomesByProcess.has(processNumber)
  );

  return processNumbers.map((processNumber) => {
    const subsidy = subsidiesByProcess.get(processNumber);
    const outcome = outcomesByProcess.get(processNumber);
    const subsidyCount = [
      subsidy.contractProvided,
      subsidy.statementProvided,
      subsidy.creditProofProvided,
      subsidy.dossierProvided,
      subsidy.debtEvolutionProvided,
      subsidy.referencedReportProvided
    ].filter(Boolean).length;

    return {
      processNumber,
      processType: outcome.processType,
      uf: outcome.uf,
      subject: outcome.subject,
      subSubject: outcome.subSubject,
      resultMacro: outcome.resultMacro,
      resultMicro: outcome.resultMicro,
      claimAmountCents: outcome.claimAmountCents,
      condemnationAmountCents: outcome.condemnationAmountCents,
      contractProvided: subsidy.contractProvided,
      statementProvided: subsidy.statementProvided,
      creditProofProvided: subsidy.creditProofProvided,
      dossierProvided: subsidy.dossierProvided,
      debtEvolutionProvided: subsidy.debtEvolutionProvided,
      referencedReportProvided: subsidy.referencedReportProvided,
      subsidyCount,
      hasFullDocumentation: subsidyCount === 6,
      claimAmountBrl: outcome.claimAmountCents / 100,
      condemnationAmountBrl: outcome.condemnationAmountCents / 100,
      condemnationRatio:
        outcome.claimAmountCents === 0
          ? 0
          : outcome.condemnationAmountCents / outcome.claimAmountCents
    };
  });
}

function buildHistoricalCases(caseFeatures) {
  return caseFeatures.map((caseFeature) => ({
    caseNumber: caseFeature.processNumber,
    processType: caseFeature.processType,
    uf: caseFeature.uf,
    causeValueBrl: caseFeature.claimAmountBrl,
    outcome: caseFeature.resultMacro,
    condemnationValueBrl: caseFeature.condemnationAmountBrl,
    featuresJson: JSON.stringify({
      processNumber: caseFeature.processNumber,
      processType: caseFeature.processType,
      uf: caseFeature.uf,
      subject: caseFeature.subject,
      subSubject: caseFeature.subSubject,
      resultMacro: caseFeature.resultMacro,
      resultMicro: caseFeature.resultMicro,
      claimAmountCents: caseFeature.claimAmountCents,
      condemnationAmountCents: caseFeature.condemnationAmountCents,
      contractProvided: caseFeature.contractProvided,
      statementProvided: caseFeature.statementProvided,
      creditProofProvided: caseFeature.creditProofProvided,
      dossierProvided: caseFeature.dossierProvided,
      debtEvolutionProvided: caseFeature.debtEvolutionProvided,
      referencedReportProvided: caseFeature.referencedReportProvided,
      subsidyCount: caseFeature.subsidyCount,
      hasFullDocumentation: caseFeature.hasFullDocumentation,
      condemnationRatio: caseFeature.condemnationRatio
    }),
    sourceJson: JSON.stringify({
      sourceSubsidies: true,
      sourceOutcomes: true,
      source: "csv_seed"
    })
  }));
}

async function main() {
  const subsidiesCsv = process.argv[2] ?? defaultSubsidiesCsv;
  const outcomesCsv = process.argv[3] ?? defaultOutcomesCsv;

  const subsidies = readSubsidies(subsidiesCsv);
  const outcomes = readOutcomes(outcomesCsv);

  const subsidiesByProcess = new Map(
    subsidies.map((row) => [row.processNumber, row])
  );
  const outcomesByProcess = new Map(
    outcomes.map((row) => [row.processNumber, row])
  );

  const allProcessNumbers = Array.from(
    new Set([...subsidiesByProcess.keys(), ...outcomesByProcess.keys()])
  ).sort();

  const processes = allProcessNumbers.map((processNumber) => ({
    processNumber,
    processType: outcomesByProcess.get(processNumber)?.processType ?? null,
    sourceSubsidies: subsidiesByProcess.has(processNumber),
    sourceOutcomes: outcomesByProcess.has(processNumber)
  }));

  const caseFeatures = buildCaseFeatures(subsidiesByProcess, outcomesByProcess);
  const historicalCases = buildHistoricalCases(caseFeatures);

  await prisma.historicalCase.deleteMany();
  await prisma.processCaseFeatures.deleteMany();
  await prisma.processOutcome.deleteMany();
  await prisma.processSubsidies.deleteMany();
  await prisma.process.deleteMany();

  await createManyInChunks(prisma.process, processes);
  await createManyInChunks(prisma.processSubsidies, subsidies);
  await createManyInChunks(prisma.processOutcome, outcomes);
  await createManyInChunks(prisma.processCaseFeatures, caseFeatures);
  await createManyInChunks(prisma.historicalCase, historicalCases);
  await createAnalyticalViews();

  console.log(`DATABASE_URL=${process.env.DATABASE_URL ?? "not-set"}`);
  console.log(`Processes: ${processes.length}`);
  console.log(`Subsidies: ${subsidies.length}`);
  console.log(`Outcomes: ${outcomes.length}`);
  console.log(`Consolidated: ${caseFeatures.length}`);
  console.log(`Historical cases: ${historicalCases.length}`);
  console.log(
    `Subsidies only: ${[...subsidiesByProcess.keys()].filter((key) => !outcomesByProcess.has(key)).length}`
  );
  console.log(
    `Outcomes only: ${[...outcomesByProcess.keys()].filter((key) => !subsidiesByProcess.has(key)).length}`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
