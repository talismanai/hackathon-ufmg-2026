export type PolicyRuleAction = "agreement" | "defense" | "review";

export type ClaimAmountBand = "low" | "medium" | "high";

export type RiskBand = "low" | "medium" | "high";

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
