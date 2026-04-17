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

test("workflow1 via API calibra policy, persiste e expõe policy ativa", async (context) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow1-api-"));
  const databasePath = path.join(tempDir, "data", "test-workflow1.sqlite");
  const databaseUrl = `file:${databasePath}`;

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  process.env.DATABASE_URL = databaseUrl;
  process.env.NODE_ENV = "test";

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

  const calibrateResponse = await app.inject({
    method: "POST",
    url: "/api/policies/calibrate",
    payload: {
      runId: "integration-run-001"
    }
  });

  assert.equal(calibrateResponse.statusCode, 201);

  const calibrateBody = calibrateResponse.json();
  assert.equal(calibrateBody.runId, "integration-run-001");
  assert.equal(calibrateBody.errors.length, 0);
  assert.ok(calibrateBody.candidateRules >= 1);
  assert.equal(calibrateBody.publishedPolicy.status, "published");
  assert.equal(calibrateBody.publishedPolicy.datasetSplit.trainRows, 40);
  assert.equal(calibrateBody.publishedPolicy.datasetSplit.testRows, 18);
  assert.ok(calibrateBody.publishedPolicy.scorecard.policyScore >= 0.8);
  assert.match(
    calibrateBody.publishedPolicy.lawyerSummary,
    /Resumo da politica de acordos/
  );

  const activeResponse = await app.inject({
    method: "GET",
    url: "/api/policies/active"
  });

  assert.equal(activeResponse.statusCode, 200);

  const activeBody = activeResponse.json();
  assert.equal(activeBody.item.status, "published");
  assert.ok(Array.isArray(activeBody.item.rules));
  assert.ok(activeBody.item.rules.length >= 1);
  assert.equal(activeBody.item.datasetSplit.trainRows, 40);
  assert.equal(activeBody.item.datasetSplit.testRows, 18);
  assert.match(activeBody.item.lawyerSummary, /advogado/i);

  const listResponse = await app.inject({
    method: "GET",
    url: "/api/policies"
  });

  assert.equal(listResponse.statusCode, 200);

  const listBody = listResponse.json();
  assert.equal(listBody.items.length, 1);

  const agentRunCount = await prisma.agentRun.count({
    where: {
      workflowType: "policy_calibration"
    }
  });

  assert.ok(agentRunCount >= 9);
});
