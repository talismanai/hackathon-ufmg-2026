import type { FastifyInstance } from "fastify";

import { backendApis } from "../../index.js";

export function registerBackendApis(app: FastifyInstance, prefix = "/api") {
  app.register(
    async (policyScope) => {
      backendApis.policyGeneratorApi.register(policyScope);
    },
    {
      prefix: `${prefix}/policy-generator`
    }
  );

  app.register(
    async (caseScope) => {
      backendApis.caseAnalyzerApi.register(caseScope);
    },
    {
      prefix: `${prefix}/case-analyzer`
    }
  );

  app.register(
    async (dashboardScope) => {
      backendApis.dashboardApi.register(dashboardScope);
    },
    {
      prefix: `${prefix}/dashboard`
    }
  );

  app.register(
    async (statusScope) => {
      backendApis.statusApi.register(statusScope);
    },
    {
      prefix
    }
  );

  app.register(
    async (traceScope) => {
      backendApis.traceApi.register(traceScope);
    },
    {
      prefix
    }
  );
}
