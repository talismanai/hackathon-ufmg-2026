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

export const evidenceRefSchema = z.object({
  docType: z.enum([
    "autos",
    "contrato",
    "extrato",
    "comprovante_credito",
    "dossie",
    "demonstrativo_divida",
    "laudo_referenciado"
  ]),
  quote: z.string().optional(),
  page: z.number().int().positive().optional(),
  field: z.string().optional()
});

export const caseDocumentSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  docType: evidenceRefSchema.shape.docType,
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  textContent: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const extractedFactsSchema = z.object({
  contractPresent: z.boolean(),
  contractDate: z.string().optional(),
  contractAmount: z.number().positive().optional(),
  creditProofPresent: z.boolean(),
  creditProofValid: z.boolean(),
  matchingDepositFound: z.boolean(),
  depositAmount: z.number().positive().optional(),
  dossierStatus: z.enum(["favorable", "inconclusive", "unfavorable", "missing"]),
  debtEvolutionPresent: z.boolean(),
  referenceReportPresent: z.boolean(),
  materialContradictions: z.number().int().nonnegative(),
  missingCriticalDocuments: z.number().int().nonnegative(),
  plaintiffClaimsNonRecognition: z.boolean(),
  notes: z.array(z.string()).optional(),
  evidenceRefs: z.array(evidenceRefSchema)
});

export const critiqueResultSchema = z.object({
  passed: z.boolean(),
  severity: z.enum(["low", "medium", "high"]),
  issues: z.array(z.string()),
  suggestedFixes: z.array(z.string()).optional()
});

export const similarCasesSummarySchema = z.object({
  sampleSize: z.number().int().nonnegative(),
  lossRate: z.number().min(0).max(1),
  medianCondemnation: z.number().nonnegative(),
  avgCondemnation: z.number().nonnegative(),
  topPatterns: z.array(z.string())
});

export const riskScoreSchema = z.object({
  lossProbability: z.number().min(0).max(1),
  expectedCondemnation: z.number().nonnegative(),
  expectedJudicialCost: z.number().nonnegative(),
  riskBand: z.enum(["low", "medium", "high"])
});

export const decisionDraftSchema = z.object({
  action: z.enum(["agreement", "defense", "review"]),
  usedRules: z.array(z.string()),
  reasoning: z.string().min(1)
});

export const caseDecisionSchema = z.object({
  action: z.enum(["agreement", "defense", "review"]),
  confidence: z.number().min(0).max(1),
  usedRules: z.array(z.string()),
  offerMin: z.number().nonnegative().optional(),
  offerTarget: z.number().nonnegative().optional(),
  offerMax: z.number().nonnegative().optional(),
  expectedJudicialCost: z.number().nonnegative(),
  expectedCondemnation: z.number().nonnegative(),
  lossProbability: z.number().min(0).max(1),
  explanationShort: z.string().min(1),
  evidenceRefs: z.array(evidenceRefSchema)
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

export const caseDecisionStateSchema = z.object({
  caseId: z.string().min(1),
  policyVersion: z.string().min(1),
  activePolicy: storedPolicySchema.optional(),
  caseRecord: z.lazy(() => caseRecordSchema).optional(),
  documents: z.array(caseDocumentSchema),
  rawTextByDocType: z.record(z.string(), z.string()),
  extractedFactsDraft: extractedFactsSchema.optional(),
  extractedFactsCritique: critiqueResultSchema.optional(),
  normalizedFacts: extractedFactsSchema.optional(),
  similarCases: similarCasesSummarySchema.optional(),
  riskScore: riskScoreSchema.optional(),
  decisionDraft: decisionDraftSchema.optional(),
  decisionCritique: critiqueResultSchema.optional(),
  finalDecision: caseDecisionSchema.optional(),
  lawyerExplanation: z.string().optional(),
  analysisId: z.string().optional(),
  errors: z.array(z.string())
});

export const storedCaseAnalysisSchema = z.object({
  id: z.string().min(1),
  caseId: z.string().min(1),
  policyVersion: z.string().min(1),
  facts: extractedFactsSchema,
  contradictions: z.record(z.string(), z.unknown()).nullable().optional(),
  similarCases: similarCasesSummarySchema.nullable().optional(),
  risk: riskScoreSchema,
  decisionDraft: decisionDraftSchema.nullable().optional(),
  decisionCritique: critiqueResultSchema.nullable().optional(),
  decision: caseDecisionSchema,
  usedRules: z.array(z.string()),
  evidenceRefs: z.array(evidenceRefSchema),
  critiqueSummary: z.string().nullable().optional(),
  recommendedAction: z.string().nullable().optional(),
  confidenceScore: z.number().nullable().optional(),
  offerMinCents: z.number().int().nullable().optional(),
  offerTargetCents: z.number().int().nullable().optional(),
  offerMaxCents: z.number().int().nullable().optional(),
  explanationShort: z.string().nullable().optional(),
  explanationText: z.string().nullable().optional(),
  generatedAt: z.string().min(1),
  createdAt: z.string().min(1)
});

export const caseRecordSchema = z.object({
  id: z.string().min(1),
  externalCaseNumber: z.string().nullable().optional(),
  processType: z.string().nullable().optional(),
  plaintiffName: z.string().nullable().optional(),
  uf: z.string().nullable().optional(),
  courtDistrict: z.string().nullable().optional(),
  claimAmountCents: z.number().int().nullable().optional(),
  status: z.string().min(1),
  input: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  documents: z.array(caseDocumentSchema),
  latestAnalysis: storedCaseAnalysisSchema.optional(),
  latestFeedback: z
    .object({
      id: z.string().min(1),
      approvalStatus: z.enum(["approved", "rejected"]),
      feedbackText: z.string().nullable().optional(),
      createdAt: z.string().min(1)
    })
    .optional()
});

export const lawyerActionInputSchema = z.object({
  analysisId: z.string().min(1),
  chosenAction: z.enum(["agreement", "defense", "review"]),
  followedRecommendation: z.boolean(),
  offeredValue: z.number().nonnegative().optional(),
  overrideReason: z.string().optional(),
  negotiationStatus: z.string().optional(),
  negotiationValue: z.number().nonnegative().optional(),
  notes: z.string().optional()
});

export const dashboardSummarySchema = z.object({
  totalCases: z.number().int().nonnegative(),
  analyzedCases: z.number().int().nonnegative(),
  adherenceRate: z.number().min(0).max(1),
  acceptanceRate: z.number().min(0).max(1),
  estimatedSavings: z.number(),
  overrides: z.number().int().nonnegative(),
  agreementsRecommended: z.number().int().nonnegative(),
  defensesRecommended: z.number().int().nonnegative()
});
