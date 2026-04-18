import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../..");
const prismaDir = path.join(rootDir, "prisma");

function resolveDatabasePath(databaseUrl) {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error(`Unsupported DATABASE_URL for SQLite: ${databaseUrl}`);
  }

  const relativePath = databaseUrl.slice("file:".length);
  return path.resolve(prismaDir, relativePath);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    ...options
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} failed`);
  }

  return result;
}

function main() {
  const databaseUrl = process.env.DATABASE_URL ?? "file:../data/hackaton.sqlite";
  const databasePath = resolveDatabasePath(databaseUrl);

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.rmSync(databasePath, { force: true });

  const sql = run("npx", [
    "prisma",
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--script"
  ]).stdout;

  run("sqlite3", [databasePath], { input: sql });

  console.log(`Prisma schema applied to: ${databasePath}`);
}

main();
