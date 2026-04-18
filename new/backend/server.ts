import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";

import { prisma } from "../../apps/api/src/db/client.js";
import { registerBackendApis } from "./transportlayers/api/registerBackendApis.js";

const runtimeConfig = {
  host: process.env.NEW_BACKEND_HOST ?? process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.NEW_BACKEND_PORT ?? 3001)
};

export function createNewBackendServer() {
  const app = Fastify({
    logger: false
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "new-backend"
  }));

  registerBackendApis(app, "/api");

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}

async function start(): Promise<void> {
  const app = createNewBackendServer();

  try {
    await app.listen({
      host: runtimeConfig.host,
      port: runtimeConfig.port
    });
    console.log(
      `New backend listening on http://${runtimeConfig.host}:${runtimeConfig.port}`
    );
  } catch (error) {
    console.error("Failed to start new backend server:", error);
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
