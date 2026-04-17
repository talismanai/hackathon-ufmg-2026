import type { PolicyRuleAction, RiskBand } from "./types.js";

export const POLICY_CALIBRATION_WORKFLOW = "policy_calibration";
export const CASE_DECISION_WORKFLOW = "case_decision";

export const POLICY_CALIBRATION_NODE_NAMES = [
  "loadHistoricalData",
  "buildFeatureBuckets",
  "proposePolicyRules",
  "critiquePolicyRules",
  "scorePolicyRules",
  "publishPolicyVersion"
] as const;

export const CASE_DECISION_NODE_NAMES = [
  "ingestCase",
  "extractFactsAction",
  "extractFactsCritique",
  "finalizeFacts",
  "retrieveSimilarCases",
  "scoreRisk",
  "proposeDecisionAction",
  "critiqueDecision",
  "finalizeDecision",
  "explainForLawyer",
  "persistDecision"
] as const;

export const FAVORABLE_OUTCOME_LABELS = ["Êxito", "Exito"] as const;

export const DEFAULT_POLICY_NAME = "Calibrated Offline Policy";

export const DEFAULT_POLICY_MIN_OFFER = 0;

export const DEFAULT_POLICY_MAX_OFFER = 999999;

export const MIN_BUCKET_SAMPLE_SIZE = 25;

export const TRAIN_SPLIT_RATIO = 0.7;

export const TARGET_POLICY_SCORE = 0.8;

export const MAX_POLICY_RETRIES = 3;

export const OFFER_FACTORS_BY_RISK_BAND: Record<
  RiskBand,
  { min: number; target: number; max: number }
> = {
  high: {
    min: 0.5525,
    target: 0.65,
    max: 0.7475
  },
  medium: {
    min: 0.3825,
    target: 0.45,
    max: 0.5175
  },
  low: {
    min: 0.2125,
    target: 0.25,
    max: 0.2875
  }
};

export const ACTION_LABELS: Record<PolicyRuleAction, string> = {
  agreement: "acordo",
  defense: "defesa",
  review: "revisao"
};

export const ONLINE_COMPATIBLE_POLICY_FIELDS = new Set([
  "contractPresent",
  "creditProofPresent",
  "dossierPresent",
  "debtEvolutionPresent",
  "referenceReportPresent",
  "claimAmountBand",
  "hasFullDocumentation"
]);

export const CRITICAL_DOC_TYPES = [
  "contrato",
  "extrato",
  "comprovante_credito"
] as const;
