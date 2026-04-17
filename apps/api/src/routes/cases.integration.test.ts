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

test("workflow2 via API analisa casos, registra a acao do advogado e alimenta dashboard", async (context) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow2-api-"));
  const databasePath = path.join(tempDir, "data", "test-workflow2.sqlite");
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
      runId: "workflow2-calibration"
    }
  });

  assert.equal(calibrateResponse.statusCode, 201);

  const createAgreementCase = await app.inject({
    method: "POST",
    url: "/api/cases",
    payload: {
      externalCaseNumber: "CASE-AGR-001",
      plaintiffName: "Maria da Silva",
      processType: "Nao reconhece operacao",
      uf: "MG",
      claimAmountCents: 1500000
    }
  });

  assert.equal(createAgreementCase.statusCode, 201);
  const agreementCaseId = createAgreementCase.json().item.id;

  const uploadAgreementDocs = await app.inject({
    method: "POST",
    url: `/api/cases/${agreementCaseId}/documents`,
    payload: {
      items: [
        {
          docType: "autos",
          fileName: "autos.txt",
          textContent:
            "A autora nao reconhece a contratacao do emprestimo e alega fraude."
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

  assert.equal(uploadAgreementDocs.statusCode, 201);

  const analyzeAgreement = await app.inject({
    method: "POST",
    url: `/api/cases/${agreementCaseId}/analyze`
  });

  assert.equal(analyzeAgreement.statusCode, 201);
  const agreementAnalysis = analyzeAgreement.json();
  assert.equal(agreementAnalysis.decision.action, "agreement");
  assert.ok(agreementAnalysis.decision.offerTarget > 0);
  assert.match(agreementAnalysis.lawyerExplanation, /Recomendacao: Acordo/);

  const createDefenseCase = await app.inject({
    method: "POST",
    url: "/api/cases",
    payload: {
      externalCaseNumber: "CASE-DEF-001",
      plaintiffName: "Joao de Souza",
      processType: "Nao reconhece operacao",
      uf: "MG",
      claimAmountCents: 400000
    }
  });

  assert.equal(createDefenseCase.statusCode, 201);
  const defenseCaseId = createDefenseCase.json().item.id;

  const uploadDefenseDocs = await app.inject({
    method: "POST",
    url: `/api/cases/${defenseCaseId}/documents`,
    payload: {
      items: [
        {
          docType: "autos",
          fileName: "autos.txt",
          textContent: "Contestacao padrao do banco."
        },
        {
          docType: "contrato",
          fileName: "contrato.txt",
          textContent: "Contrato firmado em 12/01/2024 no valor de R$ 4.000,00."
        },
        {
          docType: "comprovante_credito",
          fileName: "credito.txt",
          textContent:
            "Comprovante de credito autenticado no valor de R$ 4.000,00."
        },
        {
          docType: "extrato",
          fileName: "extrato.txt",
          textContent:
            "Credito identificado em 12/01/2024 no valor de R$ 4.000,00."
        },
        {
          docType: "dossie",
          fileName: "dossie.txt",
          textContent: "Dossie favoravel e consistente."
        },
        {
          docType: "demonstrativo_divida",
          fileName: "divida.txt",
          textContent: "Demonstrativo de evolucao da divida apresentado."
        },
        {
          docType: "laudo_referenciado",
          fileName: "laudo.txt",
          textContent: "Laudo referenciado juntado."
        }
      ]
    }
  });

  assert.equal(uploadDefenseDocs.statusCode, 201);

  const analyzeDefense = await app.inject({
    method: "POST",
    url: `/api/cases/${defenseCaseId}/analyze`
  });

  assert.equal(analyzeDefense.statusCode, 201);
  const defenseAnalysis = analyzeDefense.json();
  assert.equal(defenseAnalysis.decision.action, "defense");
  assert.equal(defenseAnalysis.decision.offerTarget, undefined);

  const registerAgreementAction = await app.inject({
    method: "POST",
    url: `/api/cases/${agreementCaseId}/lawyer-action`,
    payload: {
      analysisId: agreementAnalysis.analysisId,
      chosenAction: "agreement",
      followedRecommendation: true,
      offeredValue: 5200,
      negotiationStatus: "accepted",
      negotiationValue: 5000,
      notes: "Acordo fechado em primeira rodada."
    }
  });

  assert.equal(registerAgreementAction.statusCode, 201);

  const registerDefenseAction = await app.inject({
    method: "POST",
    url: `/api/cases/${defenseCaseId}/lawyer-action`,
    payload: {
      analysisId: defenseAnalysis.analysisId,
      chosenAction: "defense",
      followedRecommendation: true,
      notes: "Defesa mantida."
    }
  });

  assert.equal(registerDefenseAction.statusCode, 201);

  const caseDetail = await app.inject({
    method: "GET",
    url: `/api/cases/${agreementCaseId}`
  });

  assert.equal(caseDetail.statusCode, 200);
  const caseDetailBody = caseDetail.json();
  assert.equal(caseDetailBody.item.status, "actioned");
  assert.equal(caseDetailBody.item.latestAnalysis.decision.action, "agreement");

  const summaryResponse = await app.inject({
    method: "GET",
    url: "/api/dashboard/summary"
  });

  assert.equal(summaryResponse.statusCode, 200);
  const summaryBody = summaryResponse.json();
  assert.equal(summaryBody.item.totalCases, 2);
  assert.equal(summaryBody.item.analyzedCases, 2);
  assert.equal(summaryBody.item.adherenceRate, 1);
  assert.equal(summaryBody.item.acceptanceRate, 1);
  assert.ok(summaryBody.item.estimatedSavings > 0);

  const adherenceResponse = await app.inject({
    method: "GET",
    url: "/api/dashboard/adherence"
  });

  assert.equal(adherenceResponse.statusCode, 200);
  const adherenceBody = adherenceResponse.json();
  assert.equal(adherenceBody.item.totalActions, 2);
  assert.equal(adherenceBody.item.overrides, 0);

  const effectivenessResponse = await app.inject({
    method: "GET",
    url: "/api/dashboard/effectiveness"
  });

  assert.equal(effectivenessResponse.statusCode, 200);
  const effectivenessBody = effectivenessResponse.json();
  assert.equal(effectivenessBody.item.acceptanceRate, 1);
  assert.equal(effectivenessBody.item.acceptedAgreements.length, 1);

  const caseAgentRuns = await prisma.agentRun.count({
    where: {
      workflowType: "case_decision"
    }
  });

  assert.ok(caseAgentRuns >= 20);
});
