import assert from "node:assert/strict";
import test from "node:test";

import type { RiskScore, SimilarCasesSummary } from "@grupo4/shared";

import {
  critiqueDecisionDraft,
  extractFactsFromDocuments,
  finalizeCaseDecision,
  proposeDecisionDraft
} from "./case-decision.js";
import {
  makeCaseRecord,
  makeDocument,
  makePolicy
} from "../test-helpers/case-fixtures.js";

test("extractFactsFromDocuments identifica ausencia de provas criticas", () => {
  const documents = [
    makeDocument(
      "autos",
      "A autora nao reconhece a contratacao do emprestimo e alega fraude."
    ),
    makeDocument("extrato", "Extrato sem credito identificado ou TED recebida.")
  ];

  const facts = extractFactsFromDocuments(documents);

  assert.equal(facts.contractPresent, false);
  assert.equal(facts.creditProofPresent, false);
  assert.equal(facts.matchingDepositFound, false);
  assert.equal(facts.plaintiffClaimsNonRecognition, true);
  assert.ok(facts.missingCriticalDocuments >= 2);
});

test("proposeDecisionDraft aplica regra dura de defesa com documentacao coerente", async () => {
  const policy = makePolicy();
  const caseRecord = makeCaseRecord({
    claimAmountCents: 400000
  });
  const facts = extractFactsFromDocuments([
    makeDocument("autos", "Peticao inicial com narrativa padrao."),
    makeDocument("contrato", "Contrato firmado em 12/01/2024 no valor de R$ 4.000,00."),
    makeDocument(
      "comprovante_credito",
      "Comprovante de credito no valor de R$ 4.000,00 com autenticacao."
    ),
    makeDocument(
      "extrato",
      "Credito identificado em 12/01/2024 no valor de R$ 4.000,00."
    ),
    makeDocument("dossie", "Dossie favoravel e consistente."),
    makeDocument("demonstrativo_divida", "Evolucao da divida apresentada."),
    makeDocument("laudo_referenciado", "Laudo referenciado juntado.")
  ]);
  const risk: RiskScore = {
    lossProbability: 0.2,
    expectedCondemnation: 2500,
    expectedJudicialCost: 500,
    riskBand: "low"
  };

  const draft = await proposeDecisionDraft(policy, caseRecord, facts, risk);

  assert.equal(draft.action, "defense");
  assert.deepEqual(draft.usedRules, ["hard_complete_defense_documentation"]);
});

test("finalizeCaseDecision gera faixa de oferta e explicacao curta para acordo", () => {
  const policy = makePolicy();
  const caseRecord = makeCaseRecord();
  const facts = extractFactsFromDocuments([
    makeDocument(
      "autos",
      "A autora nao reconhece a contratacao do emprestimo e contesta o credito."
    ),
    makeDocument("extrato", "Extrato sem deposito identificado."),
    makeDocument("dossie", "Dossie inconclusivo.")
  ]);
  const similarCases: SimilarCasesSummary = {
    sampleSize: 18,
    lossRate: 0.78,
    medianCondemnation: 8000,
    avgCondemnation: 7600,
    topPatterns: ["comprovante ausente | dossie ausente | faixa high"]
  };
  const risk: RiskScore = {
    lossProbability: similarCases.lossRate,
    expectedCondemnation: similarCases.medianCondemnation,
    expectedJudicialCost: similarCases.lossRate * similarCases.medianCondemnation,
    riskBand: "high"
  };
  const draft = {
    action: "agreement" as const,
    usedRules: ["hard_missing_critical_documents"],
    reasoning: "Ausencia de provas criticas."
  };
  const critique = critiqueDecisionDraft(draft, facts);

  const decision = finalizeCaseDecision(
    policy,
    caseRecord,
    facts,
    risk,
    draft,
    critique
  );

  assert.equal(decision.action, "agreement");
  assert.ok((decision.offerTarget ?? 0) >= 500);
  assert.ok((decision.offerMax ?? 0) >= (decision.offerMin ?? 0));
  assert.match(decision.explanationShort, /acordo/i);
  assert.ok(decision.confidence >= 0.6);
});
