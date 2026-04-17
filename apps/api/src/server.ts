import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";

import { env } from "./config/env.js";
import { prisma } from "./db/client.js";
import { registerCaseRoutes } from "./routes/cases.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerPolicyRoutes } from "./routes/policies.js";

export function createServer() {
  const app = Fastify({
    logger: false
  });

  app.get("/health", async () => ({
    status: "ok"
  }));

  app.register(registerCaseRoutes);
  app.register(registerDashboardRoutes);
  app.register(registerPolicyRoutes);

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}

async function start(): Promise<void> {
  const app = createServer();

  try {
    await app.listen({
      host: env.host,
      port: env.port
    });
    console.log(`API listening on http://${env.host}:${env.port}`);
  } catch (error) {
    console.error("Failed to start API server:", error);
    process.exitCode = 1;
    await app.close();
  }
}

const currentFilePath = fileURLToPath(import.meta.url);
const isMainModule =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === currentFilePath;

if (isMainModule) {
  void start();
}
