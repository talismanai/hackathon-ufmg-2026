import { randomUUID } from "node:crypto";

import "../config/env.js";
import { prisma } from "../db/client.js";
import { runPolicyCalibration } from "../graphs/policy-calibration-graph.js";
import { safeStringify } from "../lib/json.js";

function readArgument(flag: string): string | undefined {
  const entry = process.argv.find((argument) => argument.startsWith(`${flag}=`));
  return entry?.slice(flag.length + 1);
}

async function main(): Promise<void> {
  const result = await runPolicyCalibration({
    runId: readArgument("--runId") ?? randomUUID(),
    inputCsvPath: readArgument("--inputCsvPath"),
    logsPath: readArgument("--logsPath")
  });

  console.log(
    safeStringify({
      runId: result.runId,
      errors: result.errors,
      calibrationAttempt: result.calibrationAttempt,
      datasetSplit: result.datasetSplit,
      featureBuckets: result.featureBuckets.length,
      candidateRules: result.candidateRules.length,
      policyLawyerSummary: result.policyLawyerSummary,
      scorecard: result.scorecard,
      publishedPolicy: result.publishedPolicy
    })
  );

  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
