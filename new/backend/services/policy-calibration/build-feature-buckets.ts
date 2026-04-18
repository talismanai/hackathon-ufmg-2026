import type { FeatureBucket, HistoricalCaseRow } from "@grupo4/shared";

import {
  average,
  isFavorableOutcome,
  median,
  toBucketKey
} from "../../lib/policy-calibration.js";

export function buildFeatureBuckets(
  historicalRows: HistoricalCaseRow[]
): FeatureBucket[] {
  const groupedRows = new Map<string, HistoricalCaseRow[]>();

  for (const row of historicalRows) {
    const bucketKey = toBucketKey(row.features);
    const rows = groupedRows.get(bucketKey) ?? [];
    rows.push(row);
    groupedRows.set(bucketKey, rows);
  }

  return [...groupedRows.entries()]
    .map(([bucketKey, rows]) => {
      const unfavorableCases = rows.filter(
        (row) => !isFavorableOutcome(row.outcome)
      );
      const condemnationValues = rows.map((row) => row.condemnationValueBrl);
      const lossCondemnationValues =
        unfavorableCases
          .map((row) => row.condemnationValueBrl)
          .filter((value) => value > 0) || [];
      const outcomeBreakdown = rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.outcome] = (acc[row.outcome] ?? 0) + 1;
        return acc;
      }, {});
      const effectiveCondemnationValues =
        lossCondemnationValues.length > 0
          ? lossCondemnationValues
          : condemnationValues.filter((value) => value > 0);
      const medianCondemnationBrl = median(effectiveCondemnationValues);
      const lossRate =
        rows.length === 0 ? 0 : unfavorableCases.length / rows.length;

      return {
        bucketKey,
        sampleSize: rows.length,
        lossRate,
        avgCondemnationBrl: average(effectiveCondemnationValues),
        medianCondemnationBrl,
        expectedJudicialCost: lossRate * medianCondemnationBrl,
        outcomeBreakdown,
        featureSnapshot: rows[0]?.features ?? {
          contractPresent: false,
          statementPresent: false,
          creditProofPresent: false,
          dossierPresent: false,
          debtEvolutionPresent: false,
          referenceReportPresent: false,
          claimAmountBand: "low",
          subsidyCount: 0,
          hasFullDocumentation: false
        }
      } satisfies FeatureBucket;
    })
    .sort((left, right) => right.sampleSize - left.sampleSize);
}
