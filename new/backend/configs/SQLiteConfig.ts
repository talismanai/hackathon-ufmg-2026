import { prisma } from "../db/client.js";

export const SQLiteConfig = {
  connection: prisma
};

export type SQLiteConnection = typeof prisma;
