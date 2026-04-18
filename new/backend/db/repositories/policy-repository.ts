import type {
  PolicyRuleDraft,
  PolicyScorecard,
  StoredPolicy
} from "@grupo4/shared";
import { storedPolicySchema } from "@grupo4/shared";

import { prisma } from "../client.js";
import { parseJson, safeStringify } from "../../lib/json.js";

type PublishPolicyInput = {
  version: string;
  name: string;
  processType?: string | null;
  minOffer: number;
  maxOffer: number;
  config: Record<string, unknown>;
  rules: PolicyRuleDraft[];
  scorecard: PolicyScorecard;
};

type PolicyWithRules = {
  id: string;
  version: string;
  name: string;
  processType: string | null;
  status: string;
  minOffer: number;
  maxOffer: number;
  configJson: string;
  scorecardJson: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  rules: Array<{
    ruleKey: string;
    priority: number;
    title: string;
    action: string;
    conditionJson: string;
    explanation: string | null;
    offerMinFactor: number | null;
    offerTargetFactor: number | null;
    offerMaxFactor: number | null;
  }>;
};

export async function archivePublishedPolicies(): Promise<void> {
  await prisma.policy.updateMany({
    where: {
      status: "published"
    },
    data: {
      status: "archived"
    }
  });
}

export async function publishPolicy({
  version,
  name,
  processType,
  minOffer,
  maxOffer,
  config,
  rules,
  scorecard
}: PublishPolicyInput): Promise<{ policyId: string; createdAt: Date }> {
  const policy = await prisma.$transaction(async (tx) => {
      await tx.policy.updateMany({
        where: {
          status: "published"
        },
        data: {
          status: "archived"
        }
      });

      const createdPolicy = await tx.policy.create({
        include: {
          rules: true
        },
        data: {
          version,
          name,
          processType: processType ?? null,
          status: "published",
          minOffer,
          maxOffer,
          configJson: safeStringify(config),
          scorecardJson: safeStringify(scorecard),
          publishedAt: new Date(),
          rules: {
            create: rules.map((rule) => ({
              ruleKey: rule.ruleKey,
              priority: rule.priority,
              title: rule.title,
              action: rule.action,
              conditionJson: safeStringify(rule.conditionJson),
              explanation: rule.explanation,
              offerMinFactor: rule.offerMinFactor ?? null,
              offerTargetFactor: rule.offerTargetFactor ?? null,
              offerMaxFactor: rule.offerMaxFactor ?? null,
              enabled: true
            }))
          }
        }
      });

      await tx.metricsSnapshot.create({
        data: {
          policyVersion: version,
          periodStart: new Date(),
          periodEnd: new Date(),
          adherenceRate: null,
          acceptanceRate: null,
          estimatedSavings: scorecard.estimatedSavings,
          metricsJson: safeStringify(scorecard)
        }
      });

      return createdPolicy;
  });

  return {
    policyId: policy.id,
    createdAt: policy.createdAt
  };
}

function toStoredPolicy(policy: PolicyWithRules): StoredPolicy {
  const config = parseJson<Record<string, unknown>>(policy.configJson, {});

  return storedPolicySchema.parse({
    policyId: policy.id,
    version: policy.version,
    name: policy.name,
    processType: policy.processType,
    status: policy.status,
    minOffer: policy.minOffer,
    maxOffer: policy.maxOffer,
    config,
    rules: policy.rules.map((rule) => ({
      ruleKey: rule.ruleKey,
      priority: rule.priority,
      title: rule.title,
      conditionSummary: rule.title,
      conditionJson: parseJson<PolicyRuleDraft["conditionJson"]>(rule.conditionJson, {
        all: []
      }),
      action: rule.action as PolicyRuleDraft["action"],
      offerMinFactor: rule.offerMinFactor ?? undefined,
      offerTargetFactor: rule.offerTargetFactor ?? undefined,
      offerMaxFactor: rule.offerMaxFactor ?? undefined,
      explanation: rule.explanation ?? ""
    })),
    scorecard: policy.scorecardJson
      ? parseJson<PolicyScorecard | undefined>(policy.scorecardJson, undefined)
      : undefined,
    lawyerSummary:
      config.lawyerSummary && typeof config.lawyerSummary === "string"
        ? config.lawyerSummary
        : undefined,
    datasetSplit: (() => {
      const datasetSplit = config.datasetSplit;

      if (
        datasetSplit &&
        typeof datasetSplit === "object" &&
        "method" in datasetSplit &&
        "totalRows" in datasetSplit &&
        "trainRows" in datasetSplit &&
        "testRows" in datasetSplit &&
        "trainRatio" in datasetSplit &&
        "testRatio" in datasetSplit
      ) {
        return datasetSplit as StoredPolicy["datasetSplit"];
      }

      return undefined;
    })(),
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
    publishedAt: policy.publishedAt?.toISOString() ?? null
  });
}

export async function listPolicies(): Promise<StoredPolicy[]> {
  const policies = await prisma.policy.findMany({
    include: {
      rules: {
        orderBy: {
          priority: "asc"
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return policies.map((policy) => toStoredPolicy(policy));
}

export async function getActivePolicy(): Promise<StoredPolicy | null> {
  const policy = await prisma.policy.findFirst({
    where: {
      status: "published"
    },
    include: {
      rules: {
        orderBy: {
          priority: "asc"
        }
      }
    },
    orderBy: {
      publishedAt: "desc"
    }
  });

  return policy ? toStoredPolicy(policy) : null;
}

export async function getPolicyByVersion(
  version: string
): Promise<StoredPolicy | null> {
  const policy = await prisma.policy.findUnique({
    where: {
      version
    },
    include: {
      rules: {
        orderBy: {
          priority: "asc"
        }
      }
    }
  });

  return policy ? toStoredPolicy(policy) : null;
}
