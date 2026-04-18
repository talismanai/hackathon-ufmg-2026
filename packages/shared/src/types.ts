export type PolicyRuleAction = "agreement" | "defense" | "review";

export type ClaimAmountBand = "low" | "medium" | "high";

export type RiskBand = "low" | "medium" | "high";

export type DocType =
  | "autos"
  | "contrato"
  | "extrato"
  | "comprovante_credito"
  | "dossie"
  | "demonstrativo_divida"
  | "laudo_referenciado";

export type ConditionOperator = "eq" | "neq" | "gte" | "lte" | "in";

export type FeatureCondition = {
  field: string;
  operator: ConditionOperator;
  value: boolean | number | string | Array<boolean | number | string>;
};

export type HistoricalCaseFeatures = {
  contractPresent: boolean;
  statementPresent: boolean;
  creditProofPresent: boolean;
  dossierPresent: boolean;
  debtEvolutionPresent: boolean;
  referenceReportPresent: boolean;
  claimAmountBand: ClaimAmountBand;
  subsidyCount: number;
  hasFullDocumentation: boolean;
  subject?: string;
  subSubject?: string;
  condemnationRatio?: number;
};

export type HistoricalCaseRow = {
  caseNumber: string;
  processType?: string | null;
  uf?: string | null;
  courtDistrict?: string | null;
  causeValueBrl: number;
  outcome: string;
  condemnationValueBrl: number;
  features: HistoricalCaseFeatures;
  source: Record<string, unknown>;
};

export type FeatureBucket = {
  bucketKey: string;
  sampleSize: number;
  lossRate: number;
  avgCondemnationBrl: number;
  medianCondemnationBrl: number;
  expectedJudicialCost: number;
  outcomeBreakdown: Record<string, number>;
  featureSnapshot: HistoricalCaseFeatures;
};

export type PolicyRuleDraft = {
  ruleKey: string;
  priority: number;
  title: string;
  conditionSummary: string;
  conditionJson: {
    all: FeatureCondition[];
    bucketKey?: string;
    sampleSize?: number;
    lossRate?: number;
  };
  action: PolicyRuleAction;
  offerMinFactor?: number;
  offerTargetFactor?: number;
  offerMaxFactor?: number;
  explanation: string;
};

export type PolicyCritiqueIssue = {
  severity: "low" | "medium" | "high";
  message: string;
  ruleKey?: string;
};

export type PolicyCritiqueReport = {
  passed: boolean;
  summary: string;
  issues: PolicyCritiqueIssue[];
};

export type PolicyScorecard = {
  totalCases: number;
  trainSampleSize: number;
  testSampleSize: number;
  matchedCases: number;
  coverageRate: number;
  estimatedPolicyCost: number;
  baselineExpectedCost: number;
  estimatedSavings: number;
  policyScore: number;
  agreementRate: number;
  defenseRate: number;
  reviewRate: number;
  hardRuleHitRate: number;
};

export type DatasetSplitSummary = {
  method: "deterministic_case_hash";
  totalRows: number;
  trainRows: number;
  testRows: number;
  trainRatio: number;
  testRatio: number;
};

export type EvidenceRef = {
  docType: DocType;
  quote?: string;
  page?: number;
  field?: string;
};

export type CaseDocument = {
  id: string;
  caseId: string;
  docType: DocType;
  fileName: string;
  mimeType: string;
  textContent: string;
  metadata?: Record<string, unknown>;
};

export type ExtractedFacts = {
  contractPresent: boolean;
  contractDate?: string;
  contractAmount?: number;
  creditProofPresent: boolean;
  creditProofValid: boolean;
  matchingDepositFound: boolean;
  depositAmount?: number;
  dossierStatus: "favorable" | "inconclusive" | "unfavorable" | "missing";
  debtEvolutionPresent: boolean;
  referenceReportPresent: boolean;
  materialContradictions: number;
  missingCriticalDocuments: number;
  plaintiffClaimsNonRecognition: boolean;
  notes?: string[];
  evidenceRefs: EvidenceRef[];
};

export type CritiqueResult = {
  passed: boolean;
  severity: "low" | "medium" | "high";
  issues: string[];
  suggestedFixes?: string[];
};

export type SimilarCasesSummary = {
  sampleSize: number;
  lossRate: number;
  medianCondemnation: number;
  avgCondemnation: number;
  topPatterns: string[];
};

export type RiskScore = {
  lossProbability: number;
  expectedCondemnation: number;
  expectedJudicialCost: number;
  riskBand: RiskBand;
};

export type DecisionDraft = {
  action: "agreement" | "defense" | "review";
  usedRules: string[];
  reasoning: string;
};

export type CaseDecision = {
  action: "agreement" | "defense" | "review";
  confidence: number;
  usedRules: string[];
  offerMin?: number;
  offerTarget?: number;
  offerMax?: number;
  expectedJudicialCost: number;
  expectedCondemnation: number;
  lossProbability: number;
  explanationShort: string;
  evidenceRefs: EvidenceRef[];
};

export type CaseDecisionState = {
  caseId: string;
  policyVersion: string;
  activePolicy?: StoredPolicy;
  caseRecord?: CaseRecord;
  documents: CaseDocument[];
  rawTextByDocType: Record<string, string>;
  extractedFactsDraft?: ExtractedFacts;
  extractedFactsCritique?: CritiqueResult;
  normalizedFacts?: ExtractedFacts;
  similarCases?: SimilarCasesSummary;
  riskScore?: RiskScore;
  decisionDraft?: DecisionDraft;
  decisionCritique?: CritiqueResult;
  finalDecision?: CaseDecision;
  lawyerExplanation?: string;
  analysisId?: string;
  errors: string[];
};

export type CaseRecord = {
  id: string;
  externalCaseNumber?: string | null;
  processType?: string | null;
  plaintiffName?: string | null;
  uf?: string | null;
  courtDistrict?: string | null;
  claimAmountCents?: number | null;
  status: string;
  input?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  documents: CaseDocument[];
  latestAnalysis?: StoredCaseAnalysis;
  latestFeedback?: {
    id: string;
    approvalStatus: "approved" | "rejected";
    feedbackText?: string | null;
    createdAt: string;
  };
};

export type StoredCaseAnalysis = {
  id: string;
  caseId: string;
  policyVersion: string;
  facts: ExtractedFacts;
  contradictions?: Record<string, unknown> | null;
  similarCases?: SimilarCasesSummary | null;
  risk: RiskScore;
  decisionDraft?: DecisionDraft | null;
  decisionCritique?: CritiqueResult | null;
  decision: CaseDecision;
  usedRules: string[];
  evidenceRefs: EvidenceRef[];
  critiqueSummary?: string | null;
  recommendedAction?: string | null;
  confidenceScore?: number | null;
  offerMinCents?: number | null;
  offerTargetCents?: number | null;
  offerMaxCents?: number | null;
  explanationShort?: string | null;
  explanationText?: string | null;
  generatedAt: string;
  createdAt: string;
};

export type LawyerActionInput = {
  analysisId: string;
  chosenAction: "agreement" | "defense" | "review";
  followedRecommendation: boolean;
  offeredValue?: number;
  overrideReason?: string;
  negotiationStatus?: string;
  negotiationValue?: number;
  notes?: string;
};

export type DashboardSummary = {
  totalCases: number;
  analyzedCases: number;
  adherenceRate: number;
  acceptanceRate: number;
  estimatedSavings: number;
  overrides: number;
  agreementsRecommended: number;
  defensesRecommended: number;
};

export type PublishedPolicy = {
  policyId: string;
  version: string;
  status: "published";
  rules: PolicyRuleDraft[];
  scorecard: PolicyScorecard;
  lawyerSummary?: string;
  datasetSplit?: DatasetSplitSummary;
  createdAt: string;
};

export type StoredPolicy = {
  policyId: string;
  version: string;
  name: string;
  processType?: string | null;
  status: string;
  minOffer: number;
  maxOffer: number;
  config: Record<string, unknown>;
  rules: PolicyRuleDraft[];
  scorecard?: PolicyScorecard;
  lawyerSummary?: string;
  datasetSplit?: DatasetSplitSummary;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
};

export type PolicyCalibrationState = {
  runId: string;
  inputCsvPath?: string;
  logsPath?: string;
  calibrationAttempt: number;
  historicalRows: HistoricalCaseRow[];
  trainingRows: HistoricalCaseRow[];
  evaluationRows: HistoricalCaseRow[];
  datasetSplit?: DatasetSplitSummary;
  featureBuckets: FeatureBucket[];
  candidateRules: PolicyRuleDraft[];
  critiqueReport?: PolicyCritiqueReport;
  scorecard?: PolicyScorecard;
  bestCandidateRules?: PolicyRuleDraft[];
  bestCritiqueReport?: PolicyCritiqueReport;
  bestScorecard?: PolicyScorecard;
  policyLawyerSummary?: string;
  publishedPolicy?: PublishedPolicy;
  errors: string[];
};
