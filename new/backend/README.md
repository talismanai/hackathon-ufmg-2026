# New Backend Architecture

Esta pasta replica a arquitetura pedida sem alterar o funcionamento do backend atual.
Agora ela tambem pode rodar de forma independente, com servidor, demo e validacao proprios.

## Mapeamento

- `agents/`
  - `PolicyGenerator/PolicyGeneratorAgent`: encapsula o workflow offline de calibracao.
  - `PolicyGenerator/PolicyCritiqueAgent`: resume o resultado da calibracao.
  - `CaseAnalyzer/CaseAnalyzerAgent`: busca a policy mais recente, busca o caso e dispara a analise.
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
- As implementacoes aqui reutilizam os workflows e repositories existentes em `apps/api/src`, mas por meio de um servidor independente.

## Comandos

- Subir o new backend:
  - `npm run new:api:start`
- Rodar demo do workflow1 + workflow2 no new backend:
  - `npm run new:demo:workflows`
- Validar tipagem e integracao do new backend:
  - `npm run new:validate`
