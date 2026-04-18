# New Backend Architecture

Esta pasta replica a arquitetura pedida sem alterar o funcionamento do backend atual.
Agora ela tambem pode rodar de forma independente, com servidor, demo e validacao proprios.

## Mapeamento

- `agents/`
  - `PolicyGenerator/PolicyGeneratorAgent`: encapsula o workflow offline de calibracao.
  - `PolicyGenerator/PolicyRulesAgent`: espelha a proposta de regras da calibracao.
  - `PolicyGenerator/PolicyCritiqueAgent`: critica regras e resume o resultado da calibracao.
  - `PolicyGenerator/PolicyToolResearchPlannerAgent`: espelha o planner de tools do workflow1.
  - `PolicyGenerator/PolicyExplainForLawyerAgent`: espelha a explicacao final da policy.
  - `CaseAnalyzer/CaseAnalyzerAgent`: busca a policy mais recente, busca o caso e dispara a analise.
  - `CaseAnalyzer/ExtractFactsAgent`: espelha a extracao inicial de fatos.
  - `CaseAnalyzer/ExtractFactsCritiqueAgent`: espelha a critica dos fatos extraidos.
  - `CaseAnalyzer/DecisionToolResearchPlannerAgent`: espelha o planner de tools do workflow2.
  - `CaseAnalyzer/DecisionProposerAgent`: espelha a proposta inicial de decisao.
  - `CaseAnalyzer/DecisionCritiqueAgent`: espelha a critica da decisao.
  - `CaseAnalyzer/ExplainForLawyerAgent`: espelha a explicacao final ao advogado.
- `configs/`
  - `SQLiteConfig`: expoe a conexao Prisma/SQLite atual.
  - `LocalStorageConfig`: define a pasta local de arquivos temporarios.
- `repositories/`
  - contratos de acesso a dados.
- `datasources/`
  - implementacoes dos contratos reaproveitando o backend atual.
- `usecase/`
  - `PolicyGeneratorUseCase`
  - `CaseAnalyzerUseCase.submitDocuments`
  - `DashboardUseCase.getAnalytics`
  - `StatusUseCase.getStatus`
- `transportlayers/api/`
  - `PolicyGeneratorApi`
  - `CaseAnalyzerApi`
  - `DashboardApi`
  - `StatusApi`
  - `registerBackendApis`

## Observacoes

- Esta estrutura fica isolada em `new/backend`.
- Nenhum arquivo do runtime atual foi redirecionado para ela.
- As implementacoes do `new/backend` agora foram internalizadas dentro desta propria arvore, sem depender de `apps/api/src`.

## Comandos

- Subir o new backend:
  - `npm run new:api:start`
- Rodar demo do workflow1 + workflow2 no new backend:
  - `npm run new:demo:workflows`
- Validar tipagem e integracao do new backend:
  - `npm run new:validate`
