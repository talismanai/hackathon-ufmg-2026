import type {
  CaseDecision,
  CaseDocument,
  CaseRecord,
  CritiqueResult,
  DecisionDraft,
  EvidenceRef,
  ExtractedFacts,
  HistoricalCaseFeatures,
  HistoricalCaseRow,
  RiskScore,
  SimilarCasesSummary,
  StoredPolicy
} from "@grupo4/shared";
import {
  CRITICAL_DOC_TYPES,
  ONLINE_COMPATIBLE_POLICY_FIELDS,
  type RiskBand
} from "@grupo4/shared";

import {
  buildOfferRange,
  isFavorableOutcome,
  riskBandFromLossProbability,
  toClaimAmountBand
} from "./policy-calibration.js";

type PolicyFeatureSnapshot = {
  contractPresent: boolean;
  creditProofPresent: boolean;
  dossierPresent: boolean;
  debtEvolutionPresent: boolean;
  referenceReportPresent: boolean;
  claimAmountBand: ReturnType<typeof toClaimAmountBand>;
  hasFullDocumentation: boolean;
};

const PLAINTIFF_NON_RECOGNITION_PATTERNS = [
  "nao reconhece",
  "não reconhece",
  "desconhece a contratacao",
  "desconhece a contratação",
  "fraude",
  "emprestimo nao contratado",
  "empréstimo não contratado"
];

const FAVORABLE_DOSSIER_PATTERNS = ["favoravel", "favorable", "consistente"];
const INCONCLUSIVE_DOSSIER_PATTERNS = [
  "inconclusivo",
  "inconclusiva",
  "insuficiente",
  "duvida"
];
const UNFAVORABLE_DOSSIER_PATTERNS = [
  "desfavoravel",
  "desfavorável",
  "invalido",
  "inválido",
  "fragil",
  "frágil"
];
const CREDIT_PROOF_INVALID_PATTERNS = [
  "sem assinatura",
  "sem autenticacao",
  "sem autenticação",
  "ilegivel",
  "não localizado",
  "nao localizado",
  "divergente"
];
const DEPOSIT_MATCH_PATTERNS = [
  "credito identificado",
  "crédito identificado",
  "deposito identificado",
  "depósito identificado",
  "ted recebida",
  "pix recebido"
];
const DEPOSIT_NEGATIVE_PATTERNS = [
  "sem deposito identificado",
  "sem depósito identificado",
  "sem credito identificado",
  "sem crédito identificado",
  "nao identificado",
  "não identificado",
  "ausencia de deposito",
  "ausência de depósito"
];

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function parseMoneyBrl(value: string): number | undefined {
  const sanitized = value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "");
  const normalized = sanitized.replace(",", ".");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed;
}

function extractFirstMoney(text: string): number | undefined {
  const match = text.match(/r\$\s*([\d.\,]+)/i);

  return match?.[1] ? parseMoneyBrl(match[1]) : undefined;
}

function extractFirstDate(text: string): string | undefined {
  const match = text.match(/\b(\d{2}[/-]\d{2}[/-]\d{4})\b/);

  return match?.[1];
}

function hasAnyPattern(text: string, patterns: string[]): boolean {
  const normalized = normalizeText(text);

  return patterns.some((pattern) => normalized.includes(normalizeText(pattern)));
}

function buildEvidenceRef(
  document: CaseDocument,
  field: string,
  quote?: string
): EvidenceRef {
  return {
    docType: document.docType,
    field,
    quote: quote?.slice(0, 180)
  };
}

function findDocument(
  documents: CaseDocument[],
  docType: CaseDocument["docType"]
): CaseDocument | undefined {
  return documents.find((document) => document.docType === docType);
}

function getClaimAmountBrl(
  caseRecord: Pick<CaseRecord, "claimAmountCents">,
  facts?: Pick<ExtractedFacts, "contractAmount" | "depositAmount">
): number {
  if (caseRecord.claimAmountCents && caseRecord.claimAmountCents > 0) {
    return caseRecord.claimAmountCents / 100;
  }

  if (facts?.contractAmount && facts.contractAmount > 0) {
    return facts.contractAmount;
  }

  if (facts?.depositAmount && facts.depositAmount > 0) {
    return facts.depositAmount;
  }

  return 0;
}

export function buildRawTextByDocType(
  documents: CaseDocument[]
): Record<string, string> {
  return documents.reduce<Record<string, string>>((accumulator, document) => {
    accumulator[document.docType] = document.textContent;
    return accumulator;
  }, {});
}

export function extractFactsFromDocuments(
  documents: CaseDocument[]
): ExtractedFacts {
  const autos = findDocument(documents, "autos");
  const contract = findDocument(documents, "contrato");
  const statement = findDocument(documents, "extrato");
  const creditProof = findDocument(documents, "comprovante_credito");
  const dossier = findDocument(documents, "dossie");
  const debtEvolution = findDocument(documents, "demonstrativo_divida");
  const referenceReport = findDocument(documents, "laudo_referenciado");
  const evidenceRefs: EvidenceRef[] = [];

  const contractPresent = Boolean(contract);
  if (contract) {
    evidenceRefs.push(buildEvidenceRef(contract, "contractPresent", contract.textContent));
  }

  const creditProofPresent = Boolean(creditProof);
  if (creditProof) {
    evidenceRefs.push(
      buildEvidenceRef(creditProof, "creditProofPresent", creditProof.textContent)
    );
  }

  const statementNormalized = statement ? normalizeText(statement.textContent) : "";
  const statementSignalsNoDeposit = hasAnyPattern(
    statement?.textContent ?? "",
    DEPOSIT_NEGATIVE_PATTERNS
  );
  const creditProofValid = creditProofPresent
    ? !hasAnyPattern(creditProof?.textContent ?? "", CREDIT_PROOF_INVALID_PATTERNS)
    : false;
  const matchingDepositFound =
    Boolean(statement) &&
    !statementSignalsNoDeposit &&
    (hasAnyPattern(statement?.textContent ?? "", DEPOSIT_MATCH_PATTERNS) ||
      Boolean(
        creditProof &&
          extractFirstMoney(creditProof.textContent) &&
          extractFirstMoney(statement?.textContent ?? "") &&
          Math.abs(
            (extractFirstMoney(creditProof.textContent) ?? 0) -
              (extractFirstMoney(statement?.textContent ?? "") ?? 0)
          ) <= 1
      ));

  if (statement) {
    evidenceRefs.push(buildEvidenceRef(statement, "matchingDepositFound", statement.textContent));
  }

  const dossierStatus: ExtractedFacts["dossierStatus"] = !dossier
    ? "missing"
    : hasAnyPattern(dossier.textContent, FAVORABLE_DOSSIER_PATTERNS)
      ? "favorable"
      : hasAnyPattern(dossier.textContent, UNFAVORABLE_DOSSIER_PATTERNS)
        ? "unfavorable"
        : hasAnyPattern(dossier.textContent, INCONCLUSIVE_DOSSIER_PATTERNS)
          ? "inconclusive"
          : "inconclusive";

  if (dossier) {
    evidenceRefs.push(buildEvidenceRef(dossier, "dossierStatus", dossier.textContent));
  }

  const contractAmount = extractFirstMoney(contract?.textContent ?? "");
  const depositAmount =
    extractFirstMoney(statement?.textContent ?? "") ??
    extractFirstMoney(creditProof?.textContent ?? "");
  const contractDate = extractFirstDate(contract?.textContent ?? "");
  const debtEvolutionPresent = Boolean(debtEvolution);
  const referenceReportPresent = Boolean(referenceReport);
  const plaintiffClaimsNonRecognition = hasAnyPattern(
    autos?.textContent ?? "",
    PLAINTIFF_NON_RECOGNITION_PATTERNS
  );

  const contradictionReasons: string[] = [];

  if (contractPresent && !creditProofPresent) {
    contradictionReasons.push("Contrato presente sem comprovante de credito.");
  }

  if (creditProofPresent && !matchingDepositFound) {
    contradictionReasons.push("Comprovante de credito sem deposito compativel no extrato.");
  }

  if (
    contractAmount &&
    depositAmount &&
    Math.abs(contractAmount - depositAmount) > Math.max(contractAmount * 0.15, 300)
  ) {
    contradictionReasons.push("Valor do contrato diverge do valor identificado no extrato.");
  }

  if (dossierStatus === "favorable" && (!creditProofValid || !matchingDepositFound)) {
    contradictionReasons.push("Dossie favoravel nao e suportado pelos documentos financeiros.");
  }

  const missingCriticalDocuments = CRITICAL_DOC_TYPES.filter(
    (docType) => !documents.some((document) => document.docType === docType)
  ).length;

  const notes: string[] = [];
  if (!creditProofValid) {
    notes.push("Comprovante de credito ausente ou fragil.");
  }
  if (!matchingDepositFound) {
    notes.push("Extrato sem deposito compativel.");
  }
  if (dossierStatus === "missing") {
    notes.push("Dossie nao foi apresentado.");
  }
  if (plaintiffClaimsNonRecognition) {
    notes.push("Autos registram alegacao de nao reconhecimento da contratacao.");
  }
  if (statement && statementNormalized.includes("estorno")) {
    notes.push("Extrato menciona estorno, o que aumenta a sensibilidade do caso.");
  }

  return {
    contractPresent,
    contractDate,
    contractAmount,
    creditProofPresent,
    creditProofValid,
    matchingDepositFound,
    depositAmount,
    dossierStatus,
    debtEvolutionPresent,
    referenceReportPresent,
    materialContradictions: contradictionReasons.length,
    missingCriticalDocuments,
    plaintiffClaimsNonRecognition,
    notes,
    evidenceRefs
  };
}

export function critiqueExtractedFacts(
  facts: ExtractedFacts,
  documents: CaseDocument[]
): CritiqueResult {
  const issues: string[] = [];
  const suggestedFixes: string[] = [];

  if (documents.length === 0) {
    issues.push("Nao ha documentos para analise.");
  }

  if (facts.missingCriticalDocuments > 0) {
    issues.push(
      `${facts.missingCriticalDocuments} documento(s) critico(s) ausente(s) para governanca minima.`
    );
    suggestedFixes.push("Solicitar contrato, extrato e comprovante de credito.");
  }

  if (facts.materialContradictions > 0) {
    issues.push(
      `Foram detectadas ${facts.materialContradictions} contradicoes materiais nos subsidios.`
    );
    suggestedFixes.push("Conferir valores e coerencia entre contrato, extrato e comprovante.");
  }

  if (facts.evidenceRefs.length < 2) {
    issues.push("Poucas evidencias estruturadas foram localizadas.");
    suggestedFixes.push("Adicionar mais trechos de prova relevantes ao caso.");
  }

  return {
    passed: issues.length === 0,
    severity:
      issues.length >= 3 ? "high" : issues.length >= 1 ? "medium" : "low",
    issues,
    suggestedFixes
  };
}

export function finalizeExtractedFacts(
  draft: ExtractedFacts,
  critique: CritiqueResult
): ExtractedFacts {
  if (critique.issues.length === 0) {
    return draft;
  }

  return {
    ...draft,
    notes: [...(draft.notes ?? []), ...critique.issues]
  };
}

export function mapFactsToHistoricalFeatures(
  caseRecord: Pick<CaseRecord, "claimAmountCents">,
  facts: ExtractedFacts
): HistoricalCaseFeatures {
  const claimAmountBrl = getClaimAmountBrl(caseRecord, facts);

  return {
    contractPresent: facts.contractPresent,
    statementPresent: facts.matchingDepositFound || facts.depositAmount !== undefined,
    creditProofPresent: facts.creditProofPresent,
    dossierPresent: facts.dossierStatus !== "missing",
    debtEvolutionPresent: facts.debtEvolutionPresent,
    referenceReportPresent: facts.referenceReportPresent,
    claimAmountBand: toClaimAmountBand(claimAmountBrl),
    subsidyCount: [
      facts.contractPresent,
      facts.creditProofPresent,
      facts.matchingDepositFound || facts.depositAmount !== undefined,
      facts.dossierStatus !== "missing",
      facts.debtEvolutionPresent,
      facts.referenceReportPresent
    ].filter(Boolean).length,
    hasFullDocumentation:
      facts.contractPresent &&
      facts.creditProofPresent &&
      (facts.matchingDepositFound || facts.depositAmount !== undefined) &&
      facts.dossierStatus !== "missing" &&
      facts.debtEvolutionPresent &&
      facts.referenceReportPresent
  };
}

function buildTopPatterns(rows: HistoricalCaseRow[]): string[] {
  const patternCounts = new Map<string, number>();

  for (const row of rows) {
    const tokens = [
      row.features.creditProofPresent
        ? "comprovante presente"
        : "comprovante ausente",
      row.features.dossierPresent ? "dossie presente" : "dossie ausente",
      `faixa ${row.features.claimAmountBand}`
    ];
    const key = tokens.join(" | ");
    patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1);
  }

  return [...patternCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([pattern]) => pattern);
}

function similarityScore(
  left: HistoricalCaseFeatures,
  right: HistoricalCaseFeatures
): number {
  let score = 0;

  if (left.creditProofPresent === right.creditProofPresent) {
    score += 3;
  }
  if (left.statementPresent === right.statementPresent) {
    score += 3;
  }
  if (left.dossierPresent === right.dossierPresent) {
    score += 2;
  }
  if (left.claimAmountBand === right.claimAmountBand) {
    score += 2;
  }
  if (left.hasFullDocumentation === right.hasFullDocumentation) {
    score += 1;
  }
  if (left.contractPresent === right.contractPresent) {
    score += 1;
  }

  return score;
}

export function summarizeSimilarCases(
  rows: HistoricalCaseRow[],
  caseRecord: Pick<CaseRecord, "claimAmountCents">,
  facts: ExtractedFacts
): SimilarCasesSummary {
  const currentFeatures = mapFactsToHistoricalFeatures(caseRecord, facts);
  const rankedRows = rows
    .map((row) => ({
      row,
      score: similarityScore(currentFeatures, row.features)
    }))
    .sort((left, right) => right.score - left.score)
    .filter((entry) => entry.score >= 6);

  const selectedRows = (rankedRows.length >= 8 ? rankedRows : rankedRows.slice(0, 5))
    .map((entry) => entry.row);

  if (selectedRows.length === 0) {
    return {
      sampleSize: 0,
      lossRate: 0.5,
      medianCondemnation: getClaimAmountBrl(caseRecord, facts) * 0.4,
      avgCondemnation: getClaimAmountBrl(caseRecord, facts) * 0.4,
      topPatterns: ["sem historico similar suficiente"]
    };
  }

  const condemnations = selectedRows.map((row) => row.condemnationValueBrl);
  const losses = selectedRows.filter((row) => !isFavorableOutcome(row.outcome)).length;
  const totalCondemnation = condemnations.reduce((sum, value) => sum + value, 0);
  const sortedCondemnations = [...condemnations].sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedCondemnations.length / 2);
  const medianCondemnation =
    sortedCondemnations.length % 2 === 0
      ? ((sortedCondemnations[middleIndex - 1] ?? 0) +
          (sortedCondemnations[middleIndex] ?? 0)) /
        2
      : (sortedCondemnations[middleIndex] ?? 0);

  return {
    sampleSize: selectedRows.length,
    lossRate: losses / selectedRows.length,
    medianCondemnation,
    avgCondemnation: totalCondemnation / selectedRows.length,
    topPatterns: buildTopPatterns(selectedRows)
  };
}

export function scoreRisk(similarCases: SimilarCasesSummary): RiskScore {
  const lossProbability = similarCases.sampleSize > 0 ? similarCases.lossRate : 0.5;
  const expectedCondemnation =
    similarCases.medianCondemnation > 0
      ? similarCases.medianCondemnation
      : similarCases.avgCondemnation;

  return {
    lossProbability,
    expectedCondemnation,
    expectedJudicialCost: lossProbability * expectedCondemnation,
    riskBand: riskBandFromLossProbability(lossProbability)
  };
}

function buildPolicyFeatureSnapshot(
  caseRecord: Pick<CaseRecord, "claimAmountCents">,
  facts: ExtractedFacts
): PolicyFeatureSnapshot {
  const mapped = mapFactsToHistoricalFeatures(caseRecord, facts);

  return {
    contractPresent: mapped.contractPresent,
    creditProofPresent: mapped.creditProofPresent,
    dossierPresent: mapped.dossierPresent,
    debtEvolutionPresent: mapped.debtEvolutionPresent,
    referenceReportPresent: mapped.referenceReportPresent,
    claimAmountBand: mapped.claimAmountBand,
    hasFullDocumentation: mapped.hasFullDocumentation
  };
}

export function findMatchingPolicyRules(
  policy: StoredPolicy,
  caseRecord: Pick<CaseRecord, "claimAmountCents">,
  facts: ExtractedFacts
): string[] {
  const snapshot = buildPolicyFeatureSnapshot(caseRecord, facts);

  return [...policy.rules]
    .sort((left, right) => left.priority - right.priority)
    .filter((rule) =>
      rule.conditionJson.all.every((condition) => {
        if (!ONLINE_COMPATIBLE_POLICY_FIELDS.has(condition.field)) {
          return false;
        }

        const currentValue =
          snapshot[condition.field as keyof PolicyFeatureSnapshot];

        switch (condition.operator) {
          case "eq":
            return currentValue === condition.value;
          case "neq":
            return currentValue !== condition.value;
          case "gte":
            return Number(currentValue) >= Number(condition.value);
          case "lte":
            return Number(currentValue) <= Number(condition.value);
          case "in":
            return Array.isArray(condition.value)
              ? condition.value.includes(currentValue as never)
              : false;
          default:
            return false;
        }
      })
    )
    .map((rule) => rule.ruleKey);
}

function buildAgreementReasons(facts: ExtractedFacts): string[] {
  const usedRules: string[] = [];

  if (!facts.creditProofValid) {
    usedRules.push("hard_invalid_credit_proof");
  }
  if (!facts.matchingDepositFound) {
    usedRules.push("hard_no_matching_deposit");
  }
  if (facts.missingCriticalDocuments >= 1) {
    usedRules.push("hard_missing_critical_documents");
  }
  if (facts.materialContradictions >= 2) {
    usedRules.push("hard_material_contradictions");
  }

  return usedRules;
}

function buildDefenseReasons(facts: ExtractedFacts): string[] {
  if (
    facts.contractPresent &&
    facts.creditProofValid &&
    facts.matchingDepositFound &&
    facts.dossierStatus === "favorable" &&
    facts.materialContradictions === 0
  ) {
    return ["hard_complete_defense_documentation"];
  }

  return [];
}

export function proposeDecisionDraft(
  policy: StoredPolicy,
  caseRecord: Pick<CaseRecord, "claimAmountCents">,
  facts: ExtractedFacts,
  risk: RiskScore
): DecisionDraft {
  const hardAgreementRules = buildAgreementReasons(facts);
  if (hardAgreementRules.length > 0) {
    return {
      action: "agreement",
      usedRules: hardAgreementRules,
      reasoning:
        "Regras duras de acordo foram acionadas por ausencia, fragilidade ou contradicao documental."
    };
  }

  const hardDefenseRules = buildDefenseReasons(facts);
  if (hardDefenseRules.length > 0) {
    return {
      action: "defense",
      usedRules: hardDefenseRules,
      reasoning:
        "Documentacao minima esta coerente e cobre contrato, credito, deposito e dossie favoravel."
    };
  }

  const matchingPolicyRules = findMatchingPolicyRules(policy, caseRecord, facts);
  if (matchingPolicyRules.length > 0) {
    const firstRule = policy.rules.find((rule) => rule.ruleKey === matchingPolicyRules[0]);

    return {
      action: firstRule?.action ?? "review",
      usedRules: matchingPolicyRules,
      reasoning: firstRule?.explanation ?? "Policy ativa aplicada ao caso."
    };
  }

  const offerRange = buildOfferRange(
    risk.expectedCondemnation,
    risk.riskBand,
    policy.minOffer,
    policy.maxOffer
  );

  return {
    action:
      risk.expectedJudicialCost >= offerRange.target * 1.15
        ? "agreement"
        : "defense",
    usedRules: ["economic_fallback"],
    reasoning:
      "Nenhuma regra dura ou regra da policy casou integralmente; a decisao foi tomada pelo custo judicial esperado."
  };
}

export function critiqueDecisionDraft(
  draft: DecisionDraft,
  facts: ExtractedFacts
): CritiqueResult {
  const issues: string[] = [];
  const suggestedFixes: string[] = [];

  if (draft.usedRules.length === 0) {
    issues.push("A decisao nao informou nenhuma regra utilizada.");
    suggestedFixes.push("Registrar explicitamente as regras e o fallback aplicado.");
  }

  if (draft.action === "defense" && buildAgreementReasons(facts).length > 0) {
    issues.push("A recomendacao de defesa conflita com regra dura de acordo.");
    suggestedFixes.push("Rever a decisao final considerando a ausencia de provas criticas.");
  }

  if (
    draft.action === "agreement" &&
    buildDefenseReasons(facts).length > 0 &&
    facts.materialContradictions === 0
  ) {
    issues.push("A recomendacao de acordo conflita com conjunto documental favoravel a defesa.");
    suggestedFixes.push("Verificar se houve aplicacao indevida do fallback economico.");
  }

  return {
    passed: issues.length === 0,
    severity:
      issues.length >= 2 ? "high" : issues.length === 1 ? "medium" : "low",
    issues,
    suggestedFixes
  };
}

function clampConfidence(value: number): number {
  return Math.max(0.35, Math.min(0.95, Number(value.toFixed(2))));
}

function dedupeEvidenceRefs(references: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();

  return references.filter((reference) => {
    const key = `${reference.docType}|${reference.field}|${reference.quote ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildExplanationShort(
  action: CaseDecision["action"],
  facts: ExtractedFacts,
  risk: RiskScore,
  critique: CritiqueResult
): string {
  const reasons: string[] = [];

  if (!facts.creditProofValid) {
    reasons.push("comprovante de credito fragil");
  }
  if (!facts.matchingDepositFound) {
    reasons.push("ausencia de deposito compativel");
  }
  if (facts.dossierStatus === "favorable") {
    reasons.push("dossie favoravel");
  }
  if (facts.missingCriticalDocuments > 0) {
    reasons.push("falta de documentos criticos");
  }
  if (critique.severity === "high") {
    reasons.push("alertas relevantes na critica");
  }
  if (reasons.length === 0) {
    reasons.push(`risco ${risk.riskBand}`);
  }

  const prefix =
    action === "agreement"
      ? "Recomendacao de acordo"
      : action === "defense"
        ? "Recomendacao de defesa"
        : "Recomendacao de revisao";

  return `${prefix} sustentada por ${reasons.slice(0, 2).join(" e ")}.`;
}

export function finalizeCaseDecision(
  policy: StoredPolicy,
  caseRecord: Pick<CaseRecord, "claimAmountCents">,
  facts: ExtractedFacts,
  risk: RiskScore,
  draft: DecisionDraft,
  critique: CritiqueResult
): CaseDecision {
  const hardAgreementRules = buildAgreementReasons(facts);
  const hardDefenseRules = buildDefenseReasons(facts);

  const action =
    hardAgreementRules.length > 0
      ? "agreement"
      : hardDefenseRules.length > 0
        ? "defense"
        : critique.severity === "high" && draft.action === "defense"
          ? "review"
          : draft.action;

  const offerRange =
    action === "agreement"
      ? buildOfferRange(
          risk.expectedCondemnation,
          risk.riskBand,
          policy.minOffer,
          policy.maxOffer
        )
      : undefined;

  let confidence = 0.5;
  if (hardAgreementRules.length > 0 || hardDefenseRules.length > 0) {
    confidence += 0.2;
  }
  if (risk.lossProbability > 0 && risk.expectedCondemnation > 0) {
    confidence += 0.05;
  }
  if (critique.severity !== "high") {
    confidence += 0.1;
  }
  if (facts.evidenceRefs.length >= 3) {
    confidence += 0.1;
  }
  if (critique.issues.length === 0) {
    confidence += 0.05;
  }
  if (action === "review") {
    confidence -= 0.15;
  }

  const usedRules =
    action === "agreement" && hardAgreementRules.length > 0
      ? hardAgreementRules
      : action === "defense" && hardDefenseRules.length > 0
        ? hardDefenseRules
        : draft.usedRules;

  return {
    action,
    confidence: clampConfidence(confidence),
    usedRules,
    offerMin: offerRange?.min,
    offerTarget: offerRange?.target,
    offerMax: offerRange?.max,
    expectedJudicialCost: risk.expectedJudicialCost,
    expectedCondemnation: risk.expectedCondemnation,
    lossProbability: risk.lossProbability,
    explanationShort: buildExplanationShort(action, facts, risk, critique),
    evidenceRefs: dedupeEvidenceRefs(facts.evidenceRefs).slice(0, 6)
  };
}

function toActionLabel(action: CaseDecision["action"]): string {
  if (action === "agreement") {
    return "Acordo";
  }
  if (action === "defense") {
    return "Defesa";
  }
  return "Revisao";
}

function formatCurrency(value?: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value ?? 0);
}

export function explainDecisionForLawyer(input: {
  decision: CaseDecision;
  facts: ExtractedFacts;
  similarCases: SimilarCasesSummary;
  risk: RiskScore;
  critique: CritiqueResult;
}): string {
  const mainReasons = [
    !input.facts.creditProofValid ? "comprovante de credito ausente ou fragil" : null,
    !input.facts.matchingDepositFound
      ? "nao foi localizado deposito compativel no extrato"
      : null,
    input.facts.dossierStatus === "favorable" ? "dossie esta favoravel ao banco" : null,
    input.facts.missingCriticalDocuments > 0
      ? `faltam ${input.facts.missingCriticalDocuments} documento(s) critico(s)`
      : null,
    input.facts.materialContradictions > 0
      ? `ha ${input.facts.materialContradictions} contradicao(oes) material(is)`
      : null
  ].filter((value): value is string => Boolean(value));

  const risks = [
    `Probabilidade estimada de perda: ${(input.risk.lossProbability * 100).toFixed(0)}%`,
    `Condenacao esperada: ${formatCurrency(input.risk.expectedCondemnation)}`,
    `Custo judicial esperado: ${formatCurrency(input.risk.expectedJudicialCost)}`
  ];

  const missingOrConflicting = [
    input.facts.missingCriticalDocuments > 0
      ? "Solicitar contrato, extrato e comprovante de credito antes de sustentar defesa."
      : null,
    input.critique.issues[0] ?? null
  ].filter((value): value is string => Boolean(value));

  return [
    `Recomendacao: ${toActionLabel(input.decision.action)}`,
    input.decision.action === "agreement"
      ? `Faixa sugerida: ${formatCurrency(input.decision.offerMin)} a ${formatCurrency(input.decision.offerMax)}`
      : "Faixa sugerida: nao aplicavel para defesa/revisao.",
    `Principais motivos: ${(mainReasons.slice(0, 3).join("; ") || "risco economico e policy ativa").trim()}.`,
    `Riscos principais: ${risks.join("; ")}.`,
    `Historico similar: ${input.similarCases.sampleSize} caso(s), loss rate ${(input.similarCases.lossRate * 100).toFixed(0)}%.`,
    `Documentos faltantes ou conflitantes: ${missingOrConflicting.join("; ") || "nenhum alerta critico adicional."}`
  ].join("\n");
}

export function getCurrentClaimAmountBrl(
  caseRecord: Pick<CaseRecord, "claimAmountCents">,
  facts?: Pick<ExtractedFacts, "contractAmount" | "depositAmount">
): number {
  return getClaimAmountBrl(caseRecord, facts);
}

export function toRiskBandLabel(riskBand: RiskBand): string {
  if (riskBand === "high") {
    return "alto";
  }
  if (riskBand === "medium") {
    return "medio";
  }
  return "baixo";
}
