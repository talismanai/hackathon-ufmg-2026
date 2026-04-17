import { z } from "zod";

export const featureConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(["eq", "neq", "gte", "lte", "in"]),
  value: z.union([
    z.boolean(),
    z.number(),
    z.string(),
    z.array(z.union([z.boolean(), z.number(), z.string()]))
  ])
});

export const historicalCaseFeaturesSchema = z.object({
  contractPresent: z.boolean(),
  statementPresent: z.boolean(),
  creditProofPresent: z.boolean(),
  dossierPresent: z.boolean(),
  debtEvolutionPresent: z.boolean(),
  referenceReportPresent: z.boolean(),
  claimAmountBand: z.enum(["low", "medium", "high"]),
  subsidyCount: z.number().int().nonnegative(),
  hasFullDocumentation: z.boolean(),
  subject: z.string().optional(),
  subSubject: z.string().optional(),
  condemnationRatio: z.number().optional()
});

export const historicalCaseRowSchema = z.object({
  caseNumber: z.string().min(1),
  processType: z.string().nullable().optional(),
  uf: z.string().nullable().optional(),
  courtDistrict: z.string().nullable().optional(),
  causeValueBrl: z.number().nonnegative(),
  outcome: z.string().min(1),
  condemnationValueBrl: z.number().nonnegative(),
  features: historicalCaseFeaturesSchema,
  source: z.record(z.string(), z.unknown())
});

export const featureBucketSchema = z.object({
  bucketKey: z.string().min(1),
  sampleSize: z.number().int().positive(),
  lossRate: z.number().min(0).max(1),
  avgCondemnationBrl: z.number().nonnegative(),
  medianCondemnationBrl: z.number().nonnegative(),
  expectedJudicialCost: z.number().nonnegative(),
  outcomeBreakdown: z.record(z.string(), z.number().int().nonnegative()),
  featureSnapshot: historicalCaseFeaturesSchema
});

export const policyRuleDraftSchema = z.object({
  ruleKey: z.string().min(1),
  priority: z.number().int().positive(),
  title: z.string().min(1),
  conditionSummary: z.string().min(1),
  conditionJson: z.object({
    all: z.array(featureConditionSchema).min(1),
    bucketKey: z.string().optional(),
    sampleSize: z.number().int().positive().optional(),
    lossRate: z.number().min(0).max(1).optional()
  }),
  action: z.enum(["agreement", "defense", "review"]),
  offerMinFactor: z.number().positive().optional(),
  offerTargetFactor: z.number().positive().optional(),
  offerMaxFactor: z.number().positive().optional(),
  explanation: z.string().min(1)
});

export const policyCritiqueIssueSchema = z.object({
  severity: z.enum(["low", "medium", "high"]),
  message: z.string().min(1),
  ruleKey: z.string().optional()
});

export const policyCritiqueReportSchema = z.object({
  passed: z.boolean(),
  summary: z.string().min(1),
  issues: z.array(policyCritiqueIssueSchema)
});

export const policyScorecardSchema = z.object({
  totalCases: z.number().int().nonnegative(),
  trainSampleSize: z.number().int().nonnegative(),
  testSampleSize: z.number().int().nonnegative(),
  matchedCases: z.number().int().nonnegative(),
  coverageRate: z.number().min(0).max(1),
  estimatedPolicyCost: z.number().nonnegative(),
  baselineExpectedCost: z.number().nonnegative(),
  estimatedSavings: z.number(),
  policyScore: z.number().min(0).max(1),
  agreementRate: z.number().min(0).max(1),
  defenseRate: z.number().min(0).max(1),
  reviewRate: z.number().min(0).max(1),
  hardRuleHitRate: z.number().min(0).max(1)
});

export const datasetSplitSummarySchema = z.object({
  method: z.literal("deterministic_case_hash"),
  totalRows: z.number().int().nonnegative(),
  trainRows: z.number().int().nonnegative(),
  testRows: z.number().int().nonnegative(),
  trainRatio: z.number().min(0).max(1),
  testRatio: z.number().min(0).max(1)
});

export const publishedPolicySchema = z.object({
  policyId: z.string().min(1),
  version: z.string().min(1),
  status: z.literal("published"),
  rules: z.array(policyRuleDraftSchema),
  scorecard: policyScorecardSchema,
  lawyerSummary: z.string().optional(),
  datasetSplit: datasetSplitSummarySchema.optional(),
  createdAt: z.string().min(1)
});

export const storedPolicySchema = z.object({
  policyId: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  processType: z.string().nullable().optional(),
  status: z.string().min(1),
  minOffer: z.number(),
  maxOffer: z.number(),
  config: z.record(z.string(), z.unknown()),
  rules: z.array(policyRuleDraftSchema),
  scorecard: policyScorecardSchema.optional(),
  lawyerSummary: z.string().optional(),
  datasetSplit: datasetSplitSummarySchema.optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  publishedAt: z.string().nullable().optional()
});

export const policyCalibrationStateSchema = z.object({
  runId: z.string().min(1),
  inputCsvPath: z.string().optional(),
  logsPath: z.string().optional(),
  calibrationAttempt: z.number().int().positive(),
  historicalRows: z.array(historicalCaseRowSchema),
  trainingRows: z.array(historicalCaseRowSchema),
  evaluationRows: z.array(historicalCaseRowSchema),
  datasetSplit: datasetSplitSummarySchema.optional(),
  featureBuckets: z.array(featureBucketSchema),
  candidateRules: z.array(policyRuleDraftSchema),
  critiqueReport: policyCritiqueReportSchema.optional(),
  scorecard: policyScorecardSchema.optional(),
  bestCandidateRules: z.array(policyRuleDraftSchema).optional(),
  bestCritiqueReport: policyCritiqueReportSchema.optional(),
  bestScorecard: policyScorecardSchema.optional(),
  policyLawyerSummary: z.string().optional(),
  publishedPolicy: publishedPolicySchema.optional(),
  errors: z.array(z.string())
});
