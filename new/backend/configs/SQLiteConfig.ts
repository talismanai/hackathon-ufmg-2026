import { prisma } from "../../../apps/api/src/db/client.js";

export const SQLiteConfig = {
  connection: prisma
};

export type SQLiteConnection = typeof prisma;
