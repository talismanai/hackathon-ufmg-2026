import test from "node:test";
import assert from "node:assert/strict";

import { buildFeatureBuckets } from "./build-feature-buckets.js";
import { makeHistoricalRow } from "../../test-helpers/policy-fixtures.js";

test("buildFeatureBuckets agrega casos do mesmo bucket e usa apenas condenacoes de perda no custo esperado", () => {
  const rows = [
    makeHistoricalRow({
      caseNumber: "1",
      outcome: "Não Êxito",
      condemnationValueBrl: 1000
    }),
    makeHistoricalRow({
      caseNumber: "2",
      outcome: "Não Êxito",
      condemnationValueBrl: 3000
    }),
    makeHistoricalRow({
      caseNumber: "3",
      outcome: "Êxito",
      condemnationValueBrl: 0
    })
  ];

  const [bucket] = buildFeatureBuckets(rows);

  assert.ok(bucket);
  assert.equal(bucket.sampleSize, 3);
  assert.equal(bucket.lossRate, 2 / 3);
  assert.equal(bucket.avgCondemnationBrl, 2000);
  assert.equal(bucket.medianCondemnationBrl, 2000);
  assert.equal(bucket.expectedJudicialCost, (2 / 3) * 2000);
  assert.equal(bucket.outcomeBreakdown["Não Êxito"], 2);
  assert.equal(bucket.outcomeBreakdown["Êxito"], 1);
});

test("buildFeatureBuckets separa combinacoes de features em buckets distintos", () => {
  const rows = [
    makeHistoricalRow({
      caseNumber: "1",
      features: {
        contractPresent: false,
        creditProofPresent: false,
        hasFullDocumentation: false,
        subsidyCount: 1
      }
    }),
    makeHistoricalRow({
      caseNumber: "2",
      features: {
        contractPresent: true,
        creditProofPresent: true,
        hasFullDocumentation: true,
        subsidyCount: 6
      }
    })
  ];

  const buckets = buildFeatureBuckets(rows);

  assert.equal(buckets.length, 2);
  assert.notEqual(buckets[0]?.bucketKey, buckets[1]?.bucketKey);
});
