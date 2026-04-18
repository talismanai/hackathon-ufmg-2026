import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { makeFeatures } from "../test-helpers/policy-fixtures.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "../../../..");

function buildHistoricalRows() {
  const highRiskFeatures = makeFeatures({
    contractPresent: false,
    statementPresent: false,
    creditProofPresent: false,
    dossierPresent: false,
    debtEvolutionPresent: false,
    referenceReportPresent: false,
    claimAmountBand: "high",
    subsidyCount: 0,
    hasFullDocumentation: false
  });
  const lowRiskFeatures = makeFeatures({
    contractPresent: true,
    statementPresent: true,
    creditProofPresent: true,
    dossierPresent: true,
    debtEvolutionPresent: true,
    referenceReportPresent: true,
    claimAmountBand: "low",
    subsidyCount: 6,
    hasFullDocumentation: true
  });

  const highRiskRows = Array.from({ length: 28 }, (_, index) => ({
    caseNumber: `AGR-${index}`,
    processType: "Nao reconhece operacao",
    uf: "MG",
    causeValueBrl: 15000,
    outcome: "Não Êxito",
    condemnationValueBrl: 12000,
    featuresJson: JSON.stringify(highRiskFeatures),
    sourceJson: JSON.stringify({ source: "integration-test" })
  }));
  const lowRiskRows = Array.from({ length: 30 }, (_, index) => ({
    caseNumber: `DEF-${index}`,
    processType: "Nao reconhece operacao",
    uf: "MG",
    causeValueBrl: 4000,
    outcome: "Êxito",
    condemnationValueBrl: 0,
    featuresJson: JSON.stringify(lowRiskFeatures),
    sourceJson: JSON.stringify({ source: "integration-test" })
  }));

  return [...highRiskRows, ...lowRiskRows];
}

const agreementCasePayload = {
  externalCaseNumber: "CASE-PARITY-001",
  plaintiffName: "Maria da Silva",
  processType: "Nao reconhece operacao",
  uf: "MG",
  claimAmountCents: 1500000
};

const agreementDocuments = [
  {
    docType: "autos" as const,
    fileName: "autos.txt",
    textContent: "A autora nao reconhece a contratacao do emprestimo e alega fraude."
  },
  {
    docType: "extrato" as const,
    fileName: "extrato.txt",
    textContent: "Extrato sem deposito identificado ou credito recebido."
  },
  {
    docType: "dossie" as const,
    fileName: "dossie.txt",
    textContent: "Dossie inconclusivo e sem anexos suficientes."
  }
];

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

test("arquitetura nova em new/backend funciona com a mesma entrada da arquitetura atual", async (context) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "new-backend-parity-"));
  const databasePath = path.join(tempDir, "data", "test-parity.sqlite");
  const databaseUrl = `file:${databasePath}`;
  const localStorageTempDir = path.join(tempDir, "temp-storage");

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  process.env.DATABASE_URL = databaseUrl;
  process.env.NODE_ENV = "test";
  process.env.NEW_LOCAL_STORAGE_TEMP_DIR = localStorageTempDir;

  const pushResult = spawnSync("node", ["src/database/pushSchema.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl
    },
    encoding: "utf8"
  });

  assert.equal(
    pushResult.status,
    0,
    pushResult.stderr || pushResult.stdout || "Falha ao criar schema de teste."
  );

  const { prisma } = await import("../db/client.js");
  await prisma.historicalCase.createMany({
    data: buildHistoricalRows()
  });

  const { createServer } = await import("../server.js");
  const app = createServer();

  context.after(async () => {
    await app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const legacyPolicyResponse = await app.inject({
    method: "POST",
    url: "/api/policies/calibrate",
    payload: {
      runId: "legacy-parity-run"
    }
  });

  assert.equal(legacyPolicyResponse.statusCode, 201);
  const legacyPolicyBody = legacyPolicyResponse.json();
  assert.equal(legacyPolicyBody.errors.length, 0);
  assert.equal(legacyPolicyBody.publishedPolicy.status, "published");

  const { backendCompositionRoot } = await import("../../../../new/backend/index.js");
  await sleep(1100);
  const newPolicyResult =
    await backendCompositionRoot.usecases.policyGeneratorUseCase.execute({
      runId: "new-parity-run"
    });

  assert.equal(newPolicyResult.state.errors.length, 0);
  assert.equal(newPolicyResult.state.publishedPolicy?.status, "published");
  assert.equal(
    newPolicyResult.state.candidateRules.length,
    legacyPolicyBody.candidateRules
  );
  assert.equal(
    newPolicyResult.state.scorecard?.policyScore,
    legacyPolicyBody.scorecard.policyScore
  );

  const legacyCreateCaseResponse = await app.inject({
    method: "POST",
    url: "/api/cases",
    payload: agreementCasePayload
  });

  assert.equal(legacyCreateCaseResponse.statusCode, 201);
  const legacyCaseId = legacyCreateCaseResponse.json().item.id;

  const legacyUploadDocsResponse = await app.inject({
    method: "POST",
    url: `/api/cases/${legacyCaseId}/documents`,
    payload: {
      items: agreementDocuments
    }
  });

  assert.equal(legacyUploadDocsResponse.statusCode, 201);

  const legacyAnalyzeResponse = await app.inject({
    method: "POST",
    url: `/api/cases/${legacyCaseId}/analyze`
  });

  assert.equal(legacyAnalyzeResponse.statusCode, 201);
  const legacyAnalyzeBody = legacyAnalyzeResponse.json();
  assert.equal(legacyAnalyzeBody.decision.action, "agreement");

  const newCaseResult =
    await backendCompositionRoot.usecases.caseAnalyzerUseCase.submitDocuments({
      caseInput: {
        ...agreementCasePayload,
        externalCaseNumber: "CASE-PARITY-002"
      },
      documents: agreementDocuments
    });

  assert.equal(newCaseResult.analysis.errors.length, 0);
  assert.equal(newCaseResult.analysis.finalDecision?.action, "agreement");
  assert.equal(
    newCaseResult.analysis.finalDecision?.action,
    legacyAnalyzeBody.decision.action
  );
  assert.equal(
    Math.round(newCaseResult.analysis.finalDecision?.offerTarget ?? 0),
    Math.round(legacyAnalyzeBody.decision.offerTarget ?? 0)
  );
  assert.equal(newCaseResult.documents.length, agreementDocuments.length);
  assert.equal(newCaseResult.localFiles.length, agreementDocuments.length);

  const analytics = await backendCompositionRoot.usecases.dashboardUseCase.getAnalytics();
  assert.ok(analytics.summary.totalCases >= 2);
  assert.ok(analytics.summary.analyzedCases >= 2);

  const status = await backendCompositionRoot.usecases.statusUseCase.getStatus(
    newCaseResult.caseRecord.id
  );
  assert.equal(status.status, "analyzed");
});
