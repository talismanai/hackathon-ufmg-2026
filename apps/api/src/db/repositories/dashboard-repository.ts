import type { DashboardSummary } from "@grupo4/shared";
import { dashboardSummarySchema } from "@grupo4/shared";

import { prisma } from "../client.js";
import { parseJson } from "../../lib/json.js";

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [
    totalCases,
    analyzedCases,
    totalActions,
    followedActions,
    acceptedAgreements,
    attemptedAgreements,
    overrides,
    agreementAnalyses,
    defenseAnalyses,
    acceptedActionValues
  ] = await Promise.all([
    prisma.case.count(),
    prisma.caseAnalysis.count(),
    prisma.lawyerAction.count(),
    prisma.lawyerAction.count({
      where: {
        followedRecommendation: true
      }
    }),
    prisma.lawyerAction.count({
      where: {
        chosenAction: "agreement",
        negotiationStatus: "accepted"
      }
    }),
    prisma.lawyerAction.count({
      where: {
        chosenAction: "agreement"
      }
    }),
    prisma.lawyerAction.count({
      where: {
        followedRecommendation: false
      }
    }),
    prisma.caseAnalysis.count({
      where: {
        recommendedAction: "agreement"
      }
    }),
    prisma.caseAnalysis.count({
      where: {
        recommendedAction: "defense"
      }
    }),
    prisma.lawyerAction.findMany({
      where: {
        chosenAction: "agreement",
        negotiationStatus: "accepted"
      },
      include: {
        analysis: true
      }
    })
  ]);

  const estimatedSavings = acceptedActionValues.reduce((sum, action) => {
    const negotiationValue =
      action.negotiationValueBrl ?? action.offeredValueBrl ?? 0;
    const expectedJudicialCost = action.analysis
      ? parseJson<{ expectedJudicialCost?: number }>(action.analysis.riskJson, {})
          .expectedJudicialCost ?? 0
      : 0;

    return sum + (expectedJudicialCost - negotiationValue);
  }, 0);

  return dashboardSummarySchema.parse({
    totalCases,
    analyzedCases,
    adherenceRate: totalActions === 0 ? 0 : followedActions / totalActions,
    acceptanceRate:
      attemptedAgreements === 0 ? 0 : acceptedAgreements / attemptedAgreements,
    estimatedSavings,
    overrides,
    agreementsRecommended: agreementAnalyses,
    defensesRecommended: defenseAnalyses
  });
}

export async function getDashboardAdherence() {
  const [totalActions, followedActions, overrides, latestActions] = await Promise.all([
    prisma.lawyerAction.count(),
    prisma.lawyerAction.count({
      where: {
        followedRecommendation: true
      }
    }),
    prisma.lawyerAction.count({
      where: {
        followedRecommendation: false
      }
    }),
    prisma.lawyerAction.findMany({
      orderBy: {
        createdAt: "desc"
      },
      take: 10,
      include: {
        case: true,
        analysis: true
      }
    })
  ]);

  return {
    totalActions,
    followedActions,
    overrides,
    adherenceRate: totalActions === 0 ? 0 : followedActions / totalActions,
    latestActions: latestActions.map((action) => ({
      id: action.id,
      caseId: action.caseId,
      externalCaseNumber: action.case.externalCaseNumber,
      recommendedAction: action.analysis.recommendedAction,
      chosenAction: action.chosenAction,
      followedRecommendation: action.followedRecommendation,
      createdAt: action.createdAt.toISOString()
    }))
  };
}

export async function getDashboardEffectiveness() {
  const [summary, acceptedActions] = await Promise.all([
    getDashboardSummary(),
    prisma.lawyerAction.findMany({
      where: {
        chosenAction: "agreement",
        negotiationStatus: "accepted"
      },
      include: {
        case: true,
        analysis: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 10
    })
  ]);

  return {
    acceptanceRate: summary.acceptanceRate,
    estimatedSavings: summary.estimatedSavings,
    agreementsRecommended: summary.agreementsRecommended,
    defensesRecommended: summary.defensesRecommended,
    acceptedAgreements: acceptedActions.map((action) => {
      const risk = parseJson<{ expectedJudicialCost?: number }>(action.analysis.riskJson, {});
      return {
        id: action.id,
        caseId: action.caseId,
        externalCaseNumber: action.case.externalCaseNumber,
        negotiationValue:
          action.negotiationValueBrl ?? action.offeredValueBrl ?? 0,
        expectedJudicialCost: risk.expectedJudicialCost ?? 0,
        createdAt: action.createdAt.toISOString()
      };
    })
  };
}
