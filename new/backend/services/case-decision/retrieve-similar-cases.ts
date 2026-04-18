import type { CaseRecord, ExtractedFacts, HistoricalCaseRow } from "@grupo4/shared";

import { listHistoricalCases } from "../../db/repositories/historical-case-repository.js";
import { parseJson } from "../../lib/json.js";
import { summarizeSimilarCases } from "../../lib/case-decision.js";

export async function retrieveSimilarCases(
  caseRecord: Pick<CaseRecord, "claimAmountCents">,
  facts: ExtractedFacts
) {
  const historicalCases = await listHistoricalCases();
  const normalizedRows = historicalCases
    .map((historicalCase) => {
      const features = parseJson<HistoricalCaseRow["features"] | null>(
        historicalCase.featuresJson,
        null
      );

      if (!features) {
        return null;
      }

      return {
        caseNumber: historicalCase.caseNumber ?? historicalCase.id,
        processType: historicalCase.processType ?? undefined,
        uf: historicalCase.uf ?? undefined,
        courtDistrict: historicalCase.courtDistrict ?? undefined,
        causeValueBrl: historicalCase.causeValueBrl ?? 0,
        outcome: historicalCase.outcome,
        condemnationValueBrl: historicalCase.condemnationValueBrl ?? 0,
        features,
        source: parseJson<Record<string, unknown>>(historicalCase.sourceJson, {})
      } satisfies HistoricalCaseRow;
    })
    .filter((row) => row !== null);

  return summarizeSimilarCases(normalizedRows, caseRecord, facts);
}
