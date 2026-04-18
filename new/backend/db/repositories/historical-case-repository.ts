import type { HistoricalCase } from "@prisma/client";

import { prisma } from "../client.js";

export async function listHistoricalCases(): Promise<HistoricalCase[]> {
  return prisma.historicalCase.findMany({
    orderBy: {
      createdAt: "asc"
    }
  });
}
