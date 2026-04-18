import { CaseAnalyzerAgent } from "./agents/CaseAnalyzer/CaseAnalyzerAgent.js";
import { PolicyCritiqueAgent } from "./agents/PolicyGenerator/PolicyCritiqueAgent.js";
import { PolicyGeneratorAgent } from "./agents/PolicyGenerator/PolicyGeneratorAgent.js";
import { LocalStorageConfig } from "./configs/LocalStorageConfig.js";
import { SQLiteConfig } from "./configs/SQLiteConfig.js";
import { LocalStorageDataSource } from "./datasources/LocalStorageDataSource.js";
import { SQLiteDataSource } from "./datasources/SQLiteDataSource.js";
import { CaseAnalyzerApi } from "./transportlayers/api/CaseAnalyzerApi.js";
import { DashboardApi } from "./transportlayers/api/DashboardApi.js";
import { PolicyGeneratorApi } from "./transportlayers/api/PolicyGeneratorApi.js";
import { registerBackendApis } from "./transportlayers/api/registerBackendApis.js";
import { StatusApi } from "./transportlayers/api/StatusApi.js";
import { TraceApi } from "./transportlayers/api/TraceApi.js";
import { CaseAnalyzerUseCase } from "./usecase/CaseAnalyzerUseCase.js";
import { DashboardUseCase } from "./usecase/DashboardUseCase.js";
import { PolicyGeneratorUseCase } from "./usecase/PolicyGeneratorUseCase.js";
import { StatusUseCase } from "./usecase/StatusUseCase.js";

const sqliteRepository = new SQLiteDataSource();
const localStorageRepository = new LocalStorageDataSource(LocalStorageConfig);

const policyGeneratorAgent = new PolicyGeneratorAgent(sqliteRepository);
const policyCritiqueAgent = new PolicyCritiqueAgent();
const caseAnalyzerAgent = new CaseAnalyzerAgent(sqliteRepository);

export const backendCompositionRoot = {
  configs: {
    SQLiteConfig,
    LocalStorageConfig
  },
  repositories: {
    sqliteRepository,
    localStorageRepository
  },
  agents: {
    policyGeneratorAgent,
    policyCritiqueAgent,
    caseAnalyzerAgent
  },
  usecases: {
    policyGeneratorUseCase: new PolicyGeneratorUseCase(
      policyGeneratorAgent,
      policyCritiqueAgent
    ),
    caseAnalyzerUseCase: new CaseAnalyzerUseCase(
      caseAnalyzerAgent,
      sqliteRepository,
      localStorageRepository
    ),
    dashboardUseCase: new DashboardUseCase(sqliteRepository),
    statusUseCase: new StatusUseCase(sqliteRepository)
  }
};

export const backendApis = {
  policyGeneratorApi: new PolicyGeneratorApi(
    backendCompositionRoot.usecases.policyGeneratorUseCase
  ),
  caseAnalyzerApi: new CaseAnalyzerApi(
    backendCompositionRoot.usecases.caseAnalyzerUseCase
  ),
  dashboardApi: new DashboardApi(
    backendCompositionRoot.usecases.dashboardUseCase
  ),
  statusApi: new StatusApi(backendCompositionRoot.usecases.statusUseCase),
  traceApi: new TraceApi()
};

export {
  CaseAnalyzerAgent,
  PolicyCritiqueAgent,
  PolicyGeneratorAgent,
  CaseAnalyzerUseCase,
  DashboardUseCase,
  PolicyGeneratorUseCase,
  StatusUseCase,
  CaseAnalyzerApi,
  DashboardApi,
  PolicyGeneratorApi,
  registerBackendApis,
  StatusApi,
  TraceApi,
  SQLiteConfig,
  LocalStorageConfig,
  SQLiteDataSource,
  LocalStorageDataSource
};
