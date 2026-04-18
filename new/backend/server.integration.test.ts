import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { makeFeatures } from "./test-helpers/policy-fixtures.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "../..");

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

test("new backend sobe independente e executa workflow1 + workflow2", async (context) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "new-backend-server-"));
  const databasePath = path.join(tempDir, "data", "test-new-backend.sqlite");
  const databaseUrl = `file:${databasePath}`;
  const localStorageTempDir = path.join(tempDir, "temp-storage");

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  process.env.DATABASE_URL = databaseUrl;
  process.env.NODE_ENV = "test";
  process.env.NEW_LOCAL_STORAGE_TEMP_DIR = localStorageTempDir;

  const pushResult = spawnSync("node", ["new/backend/scripts/push-schema.js"], {
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

  const { prisma } = await import("./db/client.js");
  await prisma.historicalCase.createMany({
    data: buildHistoricalRows()
  });

  const { createNewBackendServer } = await import("./server.js");
  const app = createNewBackendServer();

  context.after(async () => {
    await app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const healthResponse = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(healthResponse.statusCode, 200);
  assert.equal(healthResponse.json().service, "new-backend");

  const policyResponse = await app.inject({
    method: "POST",
    url: "/api/policy-generator/generate",
    payload: {
      runId: "new-backend-run"
    }
  });

  assert.equal(policyResponse.statusCode, 201);
  const policyBody = policyResponse.json();
  assert.equal(policyBody.errors.length, 0);
  assert.equal(policyBody.publishedPolicy.status, "published");
  assert.match(policyBody.traceViewerUrl, /policy_calibration/);

  const caseResponse = await app.inject({
    method: "POST",
    url: "/api/case-analyzer/submit",
    payload: {
      caseInput: {
        externalCaseNumber: "NEW-CASE-001",
        plaintiffName: "Maria da Silva",
        processType: "Nao reconhece operacao",
        uf: "MG",
        claimAmountCents: 1500000
      },
      documents: [
        {
          docType: "autos",
          fileName: "autos.txt",
          textContent: "A autora nao reconhece a contratacao do emprestimo e alega fraude."
        },
        {
          docType: "extrato",
          fileName: "extrato.txt",
          textContent: "Extrato sem deposito identificado ou credito recebido."
        },
        {
          docType: "dossie",
          fileName: "dossie.txt",
          textContent: "Dossie inconclusivo e sem anexos suficientes."
        }
      ]
    }
  });

  assert.equal(caseResponse.statusCode, 201);
  const caseBody = caseResponse.json();
  assert.equal(caseBody.errors.length, 0);
  assert.equal(caseBody.decision.action, "agreement");
  assert.equal(caseBody.localFiles.length, 3);
  assert.match(caseBody.traceViewerUrl, /case_decision/);

  const traceJsonResponse = await app.inject({
    method: "GET",
    url: caseBody.traceJsonUrl
  });

  assert.equal(traceJsonResponse.statusCode, 200);
  assert.equal(traceJsonResponse.json().workflowType, "case_decision");

  const resultResponse = await app.inject({
    method: "GET",
    url: `/api/case-analyzer/result?caseId=${caseBody.caseId}`
  });

  assert.equal(resultResponse.statusCode, 200);
  assert.equal(resultResponse.json().analysisId, caseBody.analysisId);
  assert.equal(resultResponse.json().decision.action, "agreement");

  const searchResponse = await app.inject({
    method: "GET",
    url: "/api/case-analyzer/search?processNumber=NEW-CASE-001"
  });

  assert.equal(searchResponse.statusCode, 200);
  assert.equal(searchResponse.json().caseId, caseBody.caseId);
  assert.equal(searchResponse.json().processNumber, "NEW-CASE-001");
  assert.equal(searchResponse.json().clientName, "Maria da Silva");
  assert.equal(searchResponse.json().verdictRecommendation, "Acordo");

  const feedbackResponse = await app.inject({
    method: "POST",
    url: `/api/case-feedback/${caseBody.caseId}`,
    payload: {
      analysisId: caseBody.analysisId,
      feedbackText: "Parecer aprovado pelo advogado externo.",
      approvalStatus: "approved"
    }
  });

  const expectedSavedCost =
    caseBody.decision.action === "agreement"
      ? Math.max(
          0,
          15000 -
            Number(
              caseBody.decision.offerMax ?? caseBody.decision.offerTarget ?? 0
            )
        )
      : caseBody.decision.action === "defense"
        ? Math.max(
            0,
            15000 - Number(caseBody.decision.expectedCondemnation ?? 0)
          )
        : 0;

  assert.equal(feedbackResponse.statusCode, 201);
  assert.equal(feedbackResponse.json().approvalStatus, "approved");
  assert.equal(feedbackResponse.json().aiRecommendation, "agreement");
  assert.equal(feedbackResponse.json().estimatedCauseValueBrl, expectedSavedCost);

  const feedbackSavingsResponse = await app.inject({
    method: "GET",
    url: "/api/case-feedback/savings"
  });

  assert.equal(feedbackSavingsResponse.statusCode, 200);
  assert.equal(feedbackSavingsResponse.json().approvedFeedbacks, 1);
  assert.equal(feedbackSavingsResponse.json().totalSavedCostBrl, expectedSavedCost);
  assert.equal(feedbackSavingsResponse.json().items.length, 1);

  const refreshedResultResponse = await app.inject({
    method: "GET",
    url: `/api/case-analyzer/result?caseId=${caseBody.caseId}`
  });

  assert.equal(refreshedResultResponse.statusCode, 200);
  assert.equal(refreshedResultResponse.json().caseStatus, "actioned");
  assert.equal(
    refreshedResultResponse.json().latestFeedbackApprovalStatus,
    "approved"
  );

  const analyticsResponse = await app.inject({
    method: "GET",
    url: "/api/dashboard/analytics"
  });

  assert.equal(analyticsResponse.statusCode, 200);
  const analyticsBody = analyticsResponse.json();
  assert.ok(analyticsBody.summary.totalCases >= 1);
  assert.ok(analyticsBody.summary.analyzedCases >= 1);

  const statusResponse = await app.inject({
    method: "GET",
    url: `/api/status?caseId=${caseBody.caseId}`
  });

  assert.equal(statusResponse.statusCode, 200);
  assert.equal(statusResponse.json().status, "actioned");
});
