import type {
  FeatureBucket,
  HistoricalCaseFeatures,
  HistoricalCaseRow
} from "@grupo4/shared";

import { toBucketKey } from "../lib/policy-calibration.js";

export function makeFeatures(
  overrides: Partial<HistoricalCaseFeatures> = {}
): HistoricalCaseFeatures {
  return {
    contractPresent: true,
    statementPresent: true,
    creditProofPresent: true,
    dossierPresent: true,
    debtEvolutionPresent: true,
    referenceReportPresent: true,
    claimAmountBand: "medium",
    subsidyCount: 6,
    hasFullDocumentation: true,
    subject: "Nao reconhece operacao",
    subSubject: "Generico",
    condemnationRatio: 0.5,
    ...overrides
  };
}

export function makeHistoricalRow(
  overrides: Omit<Partial<HistoricalCaseRow>, "features"> & {
    features?: Partial<HistoricalCaseFeatures>;
  } = {}
): HistoricalCaseRow {
  const features = makeFeatures(overrides.features);

  return {
    caseNumber: overrides.caseNumber ?? "0000000-00.2025.8.00.0000",
    processType: overrides.processType ?? "Nao reconhece operacao",
    uf: overrides.uf ?? "MG",
    courtDistrict: overrides.courtDistrict ?? "Belo Horizonte",
    causeValueBrl: overrides.causeValueBrl ?? 10000,
    outcome: overrides.outcome ?? "Êxito",
    condemnationValueBrl: overrides.condemnationValueBrl ?? 0,
    features,
    source: overrides.source ?? { source: "unit-test" }
  };
}

export function makeBucket(
  overrides: Omit<Partial<FeatureBucket>, "featureSnapshot"> & {
    featureSnapshot?: Partial<HistoricalCaseFeatures>;
  } = {}
): FeatureBucket {
  const { featureSnapshot: featureSnapshotOverrides, ...bucketOverrides } = overrides;
  const featureSnapshot = makeFeatures(featureSnapshotOverrides);

  return {
    bucketKey: bucketOverrides.bucketKey ?? toBucketKey(featureSnapshot),
    sampleSize: bucketOverrides.sampleSize ?? 30,
    lossRate: bucketOverrides.lossRate ?? 0.5,
    avgCondemnationBrl: bucketOverrides.avgCondemnationBrl ?? 4000,
    medianCondemnationBrl: bucketOverrides.medianCondemnationBrl ?? 3500,
    expectedJudicialCost: bucketOverrides.expectedJudicialCost ?? 1750,
    outcomeBreakdown: bucketOverrides.outcomeBreakdown ?? {
      "Êxito": 15,
      "Não Êxito": 15
    },
    featureSnapshot,
    ...bucketOverrides
  };
}
