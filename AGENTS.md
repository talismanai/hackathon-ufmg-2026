# AGENTS.md

## Papel deste arquivo

Este arquivo serve como **especificacao principal para o Codex**. A meta e gerar **codigo executavel**, e nao apenas arquitetura ou pseudocodigo.

Ao implementar este projeto:

- **nao troque a stack definida abaixo**;
- **nao introduza infraestrutura extra** no MVP (sem Redis, sem Postgres, sem filas, sem Kafka);
- **priorize um fluxo end-to-end funcionando** com dados de exemplo e dados reais quando disponiveis;
- **todo agente deve retornar JSON valido**;
- **todo output relevante deve ser persistido** em SQLite para auditoria;
- **o sistema precisa ser demonstravel do ponto de vista do advogado**.

---

## Objetivo do produto

Construir uma solucao para politica de acordos em casos de **nao reconhecimento de contratacao de emprestimo**.

A solucao precisa atender cinco resultados obrigatorios:

1. **Regra de decisao**: recomendar `acordo` ou `defesa`.
2. **Sugestao de valor**: quando a recomendacao for `acordo`, sugerir uma faixa de oferta.
3. **Acesso pratico para o advogado**: exibir a recomendacao em uma UI simples e clara.
4. **Monitoramento de aderencia**: registrar se o advogado seguiu ou nao a recomendacao.
5. **Monitoramento de efetividade**: medir taxa de aceite, overrides, economia estimada e comparacao com risco judicial.

---

## Decisoes tomadas (nao alterar)

Estas decisoes ja foram fechadas e devem ser consideradas restricoes do projeto:

- **Banco de dados**: SQLite
- **Orquestracao de agentes**: LangGraph
- **Backend**: Node.js + TypeScript
- **Frontend**: React + Vite + TypeScript
- **Padrao de raciocinio**: `action -> critique -> finalize`
- **Arquitetura**: multiagent
- **Persistencia do MVP**: arquivo SQLite local
- **Modo de execucao**: aplicacao local, simples de rodar

### Escolhas de implementacao para reduzir ambiguidade

Para o Codex, assuma estas escolhas por padrao:

- framework HTTP do backend: **Fastify**
- validacao de contratos: **Zod**
- acesso ao SQLite: **better-sqlite3** com camada propria de repositorio
- cliente OpenAI: SDK oficial `openai`
- integracao LangGraph/LangChain JS: `@langchain/langgraph`, `@langchain/core`, `@langchain/openai`
- tabelas com colunas JSON armazenadas como `TEXT`
- monorepo simples com `apps/api`, `apps/web` e `packages/shared`

Se algum detalhe nao estiver neste arquivo, **prefira a solucao mais simples que deixe o projeto executavel**.

---

## Visao do sistema

O sistema e dividido em **2 workflows**:

1. **Workflow Offline - Calibracao da Politica**
   - usa historico de sentencas, resultados e logs para propor, criticar, pontuar e publicar uma versao de politica;
   - objetivo: transformar historico em uma politica auditavel.

2. **Workflow Online - Operacao por Caso**
   - recebe os documentos de um caso, extrai fatos, critica inconsistencias, estima risco, aplica a politica e gera a recomendacao final;
   - objetivo: entregar ao advogado uma recomendacao clara, rastreavel e mensuravel.

O sistema deve ser pensado como:

- **uma rede que aprende/publca a politica**;
- **uma rede que executa a politica em cada caso**;
- **uma camada de auditoria e metricas** que mede se a politica esta sendo seguida e se esta funcionando.

---

## Principios de arquitetura

### 1. Nao usar um agente livre para decidir tudo

A decisao final nao deve depender de um unico prompt enorme.

Separar em agentes com responsabilidade unica:

- extrair fatos;
- criticar fatos;
- buscar historico similar;
- calcular risco economico;
- propor decisao;
- criticar decisao;
- finalizar recomendacao;
- explicar para o advogado;
- persistir auditoria.

### 2. Todo agente trabalha sobre estado estruturado

Nada de passar strings soltas entre agentes.

Cada workflow deve operar sobre um objeto de estado tipado.

### 3. LLM onde agrega valor; regras deterministicas onde a governanca importa

Usar LLM para:

- extracao de fatos;
- identificacao de contradicoes;
- explicacao da recomendacao;
- proposta ou revisao de regras da politica.

Usar logica deterministica para:

- score economico;
- calculo da faixa de oferta;
- metricas;
- aderencia;
- filtros de politica;
- publicacao da policy version.

### 4. Toda decisao importante precisa ser auditavel

Toda recomendacao deve salvar:

- `policy_version`
- `used_rules`
- `confidence`
- `facts`
- `evidence_refs`
- `critique_summary`
- `generated_at`

---

## Padrao Multiagent: Action -> Critique -> Finalize

Esse padrao deve ser usado tanto no workflow offline quanto no online.

### Regra geral

1. **Action Agent**
   - faz a proposta inicial;
   - ex.: extrai fatos ou recomenda `acordo`.

2. **Critique Agent**
   - nao cria uma nova decisao do zero;
   - procura falta de evidencia, contradicoes, violacoes da politica e confianca baixa.

3. **Finalize Agent**
   - recebe proposta + critica;
   - consolida a resposta final em JSON estrito.

### Exemplo no caso online

- `extractFactsAction` -> extrai fatos dos documentos;
- `extractFactsCritique` -> aponta conflitos, lacunas e trechos duvidosos;
- `finalizeFacts` -> gera `facts` normalizados.

Depois:

- `proposeDecisionAction` -> recomenda `acordo` ou `defesa`;
- `critiqueDecision` -> aponta problemas da recomendacao;
- `finalizeDecision` -> publica a decisao final.

### Restricoes dos agentes criticos

Agentes criticos:

- nao podem inventar novos documentos;
- nao podem introduzir fatos nao presentes no estado;
- nao podem substituir o papel do scorer economico;
- nao podem publicar decisao sem passar pelo finalizador.

---

## Workflow 1 - Calibracao da Politica (offline)

### Objetivo

Gerar uma **policy_version** a partir do historico.

### Inputs

- CSV de sentencas historicas;
- opcionalmente logs de acordo/override;
- opcionalmente features agregadas dos documentos.

### Output principal

Uma politica publicada com:

- `version`
- `status = published`
- conjunto de regras
- parametros economicos
- scorecard de desempenho

### Estado do workflow offline

```ts
export type PolicyCalibrationState = {
  runId: string;
  inputCsvPath: string;
  logsPath?: string;
  historicalRows: HistoricalCaseRow[];
  featureBuckets: FeatureBucket[];
  candidateRules: PolicyRuleDraft[];
  critiqueReport?: PolicyCritiqueReport;
  scorecard?: PolicyScorecard;
  publishedPolicy?: PublishedPolicy;
  errors: string[];
};
```

### Agentes/nos do workflow offline

#### 1. `loadHistoricalData`
Responsabilidade:
- carregar CSV historico;
- validar colunas obrigatorias;
- normalizar outcomes.

#### 2. `buildFeatureBuckets`
Responsabilidade:
- agregar historico em buckets uteis para decisao;
- exemplo: taxa de condenacao por combinacao de features.

Buckets iniciais aceitaveis:
- presenca ou ausencia de comprovante de credito;
- existencia de deposito compativel no extrato;
- dossie favoravel/inconclusivo;
- faixa de valor da causa;
- resultado historico;
- mediana de condenacao.

#### 3. `proposePolicyRules`
Tipo: LLM action agent.

Responsabilidade:
- propor regras objetivas de politica usando apenas os buckets disponiveis.

Saida esperada:

```ts
export type PolicyRuleDraft = {
  ruleKey: string;
  priority: number;
  title: string;
  conditionSummary: string;
  conditionJson: Record<string, unknown>;
  action: "agreement" | "defense" | "review";
  offerMinFactor?: number;
  offerTargetFactor?: number;
  offerMaxFactor?: number;
  explanation: string;
};
```

#### 4. `critiquePolicyRules`
Tipo: LLM critique agent.

Responsabilidade:
- verificar se as regras sao ambiguas, redundantes, contraditorias ou impossiveis de operacionalizar.

#### 5. `scorePolicyRules`
Tipo: deterministico.

Responsabilidade:
- rodar um backtest simples;
- medir economia estimada vs baseline;
- medir cobertura das regras;
- medir quantos casos ficaram em `review`.

Metricas iniciais:
- `coverageRate`
- `estimatedSavings`
- `agreementRate`
- `defenseRate`
- `reviewRate`
- `hardRuleHitRate`

#### 6. `publishPolicyVersion`
Tipo: deterministico.

Responsabilidade:
- persistir politica no SQLite;
- marcar uma policy como `published`;
- arquivar a anterior, se necessario.

### Logica inicial de score economico no offline

Usar uma versao simples para o MVP:

```txt
expected_judicial_cost = p_loss * expected_condemnation
```

Onde:

- `p_loss` = frequencia historica de desfechos desfavoraveis no bucket
- `expected_condemnation` = media ou mediana de condenacao no bucket

### Baseline para comparacao

Criar um baseline simples chamado `always_defend`.

A politica calibrada precisa mostrar pelo menos:

- custo esperado da politica
- custo esperado do baseline
- economia estimada

---

## Workflow 2 - Operacao por Caso (online)

### Objetivo

Receber um caso, analisar os documentos, aplicar a politica atual e entregar ao advogado:

- recomendacao `acordo` ou `defesa`
- faixa de oferta
- justificativa curta
- regras usadas
- nivel de confianca

### Inputs

- autos do processo
- subsidios do banco
  - contrato
  - extrato
  - comprovante de credito
  - dossie
  - demonstrativo de evolucao da divida
  - laudo referenciado
- policy_version ativa
- historico similar

### Output principal

```ts
export type CaseDecision = {
  action: "agreement" | "defense" | "review";
  confidence: number;
  usedRules: string[];
  offerMin?: number;
  offerTarget?: number;
  offerMax?: number;
  expectedJudicialCost: number;
  expectedCondemnation: number;
  lossProbability: number;
  explanationShort: string;
  evidenceRefs: EvidenceRef[];
};
```

### Estado do workflow online

```ts
export type CaseDecisionState = {
  caseId: string;
  policyVersion: string;
  documents: CaseDocument[];
  rawTextByDocType: Record<string, string>;
  extractedFactsDraft?: ExtractedFacts;
  extractedFactsCritique?: CritiqueResult;
  normalizedFacts?: ExtractedFacts;
  similarCases?: SimilarCasesSummary;
  riskScore?: RiskScore;
  decisionDraft?: DecisionDraft;
  decisionCritique?: CritiqueResult;
  finalDecision?: CaseDecision;
  errors: string[];
};
```

### Agentes/nos do workflow online

#### 1. `ingestCase`
Responsabilidade:
- carregar caso e documentos do banco SQLite;
- validar se ha documentos minimos;
- montar `rawTextByDocType`.

#### 2. `extractFactsAction`
Tipo: LLM action agent.

Responsabilidade:
- extrair fatos juridicamente relevantes dos documentos.

Fatos minimos a extrair:

- `contractPresent`
- `contractDate`
- `contractAmount`
- `creditProofPresent`
- `creditProofValid`
- `matchingDepositFound`
- `depositAmount`
- `dossierStatus` (`favorable`, `inconclusive`, `unfavorable`, `missing`)
- `debtEvolutionPresent`
- `referenceReportPresent`
- `materialContradictions`
- `missingCriticalDocuments`
- `plaintiffClaimsNonRecognition`

#### 3. `extractFactsCritique`
Tipo: LLM critique agent.

Responsabilidade:
- detectar contradicoes entre documentos;
- detectar fatos extraidos sem evidencia suficiente;
- apontar campos incertos.

#### 4. `finalizeFacts`
Tipo: deterministico ou LLM leve.

Responsabilidade:
- consolidar um JSON final de fatos;
- incluir `evidenceRefs` com trechos, paginas ou documentos.

#### 5. `retrieveSimilarCases`
Tipo: deterministico.

Responsabilidade:
- buscar casos historicos parecidos a partir das features principais.

MVP aceitavel:
- nao usar vetor ou embedding;
- usar filtros simples com buckets e agregacoes em SQLite.

Campos iniciais para similaridade:
- comprovante presente/ausente;
- deposito compativel presente/ausente;
- status do dossie;
- faixa de valor da causa.

Saida:

```ts
export type SimilarCasesSummary = {
  sampleSize: number;
  lossRate: number;
  medianCondemnation: number;
  avgCondemnation: number;
  topPatterns: string[];
};
```

#### 6. `scoreRisk`
Tipo: deterministico.

Responsabilidade:
- calcular risco economico do caso.

```ts
export type RiskScore = {
  lossProbability: number;
  expectedCondemnation: number;
  expectedJudicialCost: number;
  riskBand: "low" | "medium" | "high";
};
```

Formula inicial do MVP:

```txt
lossProbability = similarCases.lossRate
expectedCondemnation = similarCases.medianCondemnation
expectedJudicialCost = lossProbability * expectedCondemnation
```

#### 7. `proposeDecisionAction`
Tipo: LLM action agent.

Responsabilidade:
- receber fatos + score + policy_version;
- propor `agreement`, `defense` ou `review`;
- listar `usedRules`.

#### 8. `critiqueDecision`
Tipo: LLM critique agent.

Responsabilidade:
- verificar se a recomendacao contradiz fatos ou politica;
- verificar se faltou citar regra importante;
- verificar se a explicacao esta fraca.

#### 9. `finalizeDecision`
Tipo: deterministico com opcional apoio de LLM.

Responsabilidade:
- consolidar a decisao final;
- calcular faixa de oferta se `agreement`;
- definir `confidence`;
- gerar output padronizado.

#### 10. `explainForLawyer`
Tipo: LLM.

Responsabilidade:
- converter a decisao em texto simples de UI.

Formato esperado:
- recomendacao
- faixa sugerida
- 3 principais motivos
- principais riscos
- documentos faltantes ou conflitantes

#### 11. `persistDecision`
Tipo: deterministico.

Responsabilidade:
- salvar analise, facts, critique e decisao no SQLite.

#### 12. `captureLawyerAction`
Tipo: API + persistencia.

Responsabilidade:
- registrar o que o advogado fez:
  - seguiu ou nao seguiu a recomendacao
  - valor ofertado
  - motivo do override
  - resultado da negociacao

#### 13. `computeMetrics`
Tipo: deterministico.

Responsabilidade:
- atualizar metricas para dashboard.

---

## Regras iniciais de negocio para o MVP

Estas regras devem existir como **baseline operacional inicial**.

### Regras duras para acordo

Recomendar `agreement` se qualquer uma for verdadeira:

1. `creditProofValid = false`
2. `matchingDepositFound = false`
3. `missingCriticalDocuments >= 1`
4. `materialContradictions >= 2`

### Regras duras para defesa

Recomendar `defense` se todas forem verdadeiras:

1. `contractPresent = true`
2. `creditProofValid = true`
3. `matchingDepositFound = true`
4. `dossierStatus = favorable`
5. `materialContradictions = 0`

### Regra economica fallback

Se nenhuma regra dura se aplicar:

```txt
se expected_judicial_cost >= offer_target * 1.15 => agreement
senao => defense
```

### Faixa de oferta no MVP

Usar `expectedCondemnation` e `riskBand`.

#### Risk band high

- `offerTarget = expectedCondemnation * 0.65`
- `offerMin = offerTarget * 0.85`
- `offerMax = offerTarget * 1.15`

#### Risk band medium

- `offerTarget = expectedCondemnation * 0.45`
- `offerMin = offerTarget * 0.85`
- `offerMax = offerTarget * 1.15`

#### Risk band low

- `offerTarget = expectedCondemnation * 0.25`
- `offerMin = offerTarget * 0.85`
- `offerMax = offerTarget * 1.15`

### Clamp de oferta

Aplicar limites minimos e maximos na policy ativa:

```ts
finalOfferMin = Math.max(policy.minOffer, offerMin)
finalOfferMax = Math.min(policy.maxOffer, offerMax)
finalOfferTarget = Math.min(finalOfferMax, Math.max(finalOfferMin, offerTarget))
```

---

## Contratos de dados TypeScript

Criar estes tipos em `packages/shared/src/types.ts`.

```ts
export type DocType =
  | "autos"
  | "contrato"
  | "extrato"
  | "comprovante_credito"
  | "dossie"
  | "demonstrativo_divida"
  | "laudo_referenciado";

export type EvidenceRef = {
  docType: DocType;
  quote?: string;
  page?: number;
  field?: string;
};

export type CaseDocument = {
  id: string;
  caseId: string;
  docType: DocType;
  fileName: string;
  mimeType: string;
  textContent: string;
  metadata?: Record<string, unknown>;
};

export type ExtractedFacts = {
  contractPresent: boolean;
  contractDate?: string;
  contractAmount?: number;
  creditProofPresent: boolean;
  creditProofValid: boolean;
  matchingDepositFound: boolean;
  depositAmount?: number;
  dossierStatus: "favorable" | "inconclusive" | "unfavorable" | "missing";
  debtEvolutionPresent: boolean;
  referenceReportPresent: boolean;
  materialContradictions: number;
  missingCriticalDocuments: number;
  plaintiffClaimsNonRecognition: boolean;
  notes?: string[];
  evidenceRefs: EvidenceRef[];
};

export type CritiqueResult = {
  passed: boolean;
  severity: "low" | "medium" | "high";
  issues: string[];
  suggestedFixes?: string[];
};

export type SimilarCasesSummary = {
  sampleSize: number;
  lossRate: number;
  medianCondemnation: number;
  avgCondemnation: number;
  topPatterns: string[];
};

export type RiskScore = {
  lossProbability: number;
  expectedCondemnation: number;
  expectedJudicialCost: number;
  riskBand: "low" | "medium" | "high";
};

export type DecisionDraft = {
  action: "agreement" | "defense" | "review";
  usedRules: string[];
  reasoning: string;
};

export type CaseDecision = {
  action: "agreement" | "defense" | "review";
  confidence: number;
  usedRules: string[];
  offerMin?: number;
  offerTarget?: number;
  offerMax?: number;
  expectedJudicialCost: number;
  expectedCondemnation: number;
  lossProbability: number;
  explanationShort: string;
  evidenceRefs: EvidenceRef[];
};
```

---

## Schema SQLite

Criar um arquivo `apps/api/src/db/schema.sql` com estas tabelas.

```sql
CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft', 'published', 'archived')),
  min_offer REAL NOT NULL DEFAULT 0,
  max_offer REAL NOT NULL DEFAULT 999999,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS policy_rules (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  priority INTEGER NOT NULL,
  title TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('agreement', 'defense', 'review')),
  condition_json TEXT NOT NULL,
  explanation TEXT,
  offer_min_factor REAL,
  offer_target_factor REAL,
  offer_max_factor REAL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(policy_id) REFERENCES policies(id)
);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  external_case_number TEXT,
  plaintiff_name TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS case_documents (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  text_content TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(case_id) REFERENCES cases(id)
);

CREATE TABLE IF NOT EXISTS extracted_facts_runs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  facts_json TEXT NOT NULL,
  critique_json TEXT,
  normalized_facts_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(case_id) REFERENCES cases(id)
);

CREATE TABLE IF NOT EXISTS historical_cases (
  id TEXT PRIMARY KEY,
  case_number TEXT,
  cause_value REAL,
  outcome TEXT NOT NULL,
  condemnation_value REAL,
  features_json TEXT,
  source_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS case_analyses (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  facts_json TEXT NOT NULL,
  contradictions_json TEXT,
  similar_cases_json TEXT,
  risk_json TEXT NOT NULL,
  decision_draft_json TEXT,
  decision_critique_json TEXT,
  decision_json TEXT NOT NULL,
  explanation_text TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(case_id) REFERENCES cases(id)
);

CREATE TABLE IF NOT EXISTS lawyer_actions (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  analysis_id TEXT NOT NULL,
  chosen_action TEXT NOT NULL CHECK(chosen_action IN ('agreement', 'defense', 'review')),
  followed_recommendation INTEGER NOT NULL,
  offered_value REAL,
  override_reason TEXT,
  negotiation_status TEXT,
  negotiation_value REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(case_id) REFERENCES cases(id),
  FOREIGN KEY(analysis_id) REFERENCES case_analyses(id)
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  workflow_type TEXT NOT NULL,
  case_id TEXT,
  agent_name TEXT NOT NULL,
  input_json TEXT,
  output_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS metrics_snapshots (
  id TEXT PRIMARY KEY,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  adherence_rate REAL,
  acceptance_rate REAL,
  estimated_savings REAL,
  metrics_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## Estrutura de pastas esperada

```txt
.
├── AGENTS.md
├── package.json
├── packages/
│   └── shared/
│       └── src/
│           ├── types.ts
│           ├── schemas.ts
│           └── constants.ts
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── index.ts
│   │       ├── server.ts
│   │       ├── config/
│   │       ├── db/
│   │       │   ├── client.ts
│   │       │   ├── migrate.ts
│   │       │   ├── schema.sql
│   │       │   ├── seeds/
│   │       │   └── repositories/
│   │       ├── routes/
│   │       ├── services/
│   │       ├── agents/
│   │       │   ├── extract-facts-action.ts
│   │       │   ├── extract-facts-critique.ts
│   │       │   ├── propose-decision-action.ts
│   │       │   ├── critique-decision.ts
│   │       │   ├── explain-for-lawyer.ts
│   │       │   ├── propose-policy-rules.ts
│   │       │   └── critique-policy-rules.ts
│   │       ├── graphs/
│   │       │   ├── case-decision-graph.ts
│   │       │   └── policy-calibration-graph.ts
│   │       ├── prompts/
│   │       ├── lib/
│   │       └── scripts/
│   └── web/
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── api/
│           ├── components/
│           ├── pages/
│           │   ├── DashboardPage.tsx
│           │   ├── PolicyLabPage.tsx
│           │   ├── CasesPage.tsx
│           │   └── CaseDetailPage.tsx
│           ├── hooks/
│           ├── types/
│           └── utils/
└── sample-data/
    ├── historical_cases.csv
    └── example-cases/
```

---

## Endpoints do backend

Implementar no minimo estes endpoints.

### Cases

#### `POST /api/cases`
Cria um caso.

Body:

```json
{
  "externalCaseNumber": "123456",
  "plaintiffName": "Maria da Silva"
}
```

#### `POST /api/cases/:caseId/documents`
Recebe um ou mais documentos ja convertidos em texto.

MVP:
- aceitar JSON com `docType`, `fileName`, `textContent`;
- upload binario de PDF pode ficar para segunda iteracao.

#### `GET /api/cases`
Lista casos.

#### `GET /api/cases/:caseId`
Retorna caso + documentos + ultima analise.

#### `POST /api/cases/:caseId/analyze`
Executa o workflow online.

Response:

```json
{
  "analysisId": "...",
  "decision": {
    "action": "agreement",
    "confidence": 0.84,
    "usedRules": ["missing_credit_proof", "no_matching_deposit"],
    "offerMin": 2800,
    "offerTarget": 3500,
    "offerMax": 4200,
    "expectedJudicialCost": 7100,
    "expectedCondemnation": 6400,
    "lossProbability": 0.78,
    "explanationShort": "Faltam provas criticas e o custo esperado judicial e alto.",
    "evidenceRefs": []
  }
}
```

#### `POST /api/cases/:caseId/lawyer-action`
Registra o que o advogado fez.

Body:

```json
{
  "analysisId": "...",
  "chosenAction": "agreement",
  "followedRecommendation": true,
  "offeredValue": 3300,
  "overrideReason": "",
  "negotiationStatus": "accepted",
  "negotiationValue": 3200,
  "notes": "A parte autora aceitou apos contraproposta."
}
```

### Policies

#### `GET /api/policies/active`
Retorna policy ativa.

#### `POST /api/policies/calibrate`
Executa workflow offline e gera uma draft policy.

#### `POST /api/policies/:policyId/publish`
Publica uma policy.

#### `GET /api/policies`
Lista versoes de policy.

### Dashboard

#### `GET /api/dashboard/summary`
Retorna metricas resumidas.

#### `GET /api/dashboard/adherence`
Retorna aderencia por periodo, advogado ou escritorio.

#### `GET /api/dashboard/effectiveness`
Retorna taxa de aceite, overrides e economia estimada.

---

## Pags/telas do frontend

Implementar um frontend simples, claro e demonstravel.

### 1. DashboardPage
Objetivo:
- mostrar metricas executivas.

Cards minimos:
- aderencia a politica
- taxa de aceite
- economia estimada
- total de overrides
- total de casos analisados

### 2. CasesPage
Objetivo:
- listar os casos;
- permitir abrir o detalhe de um caso.

Colunas minimas:
- numero do caso
- status
- ultima recomendacao
- policy_version
- data da analise

### 3. CaseDetailPage
Objetivo:
- ser a tela do advogado.

Blocos minimos:
- documentos disponiveis
- fatos extraidos
- contradicoes encontradas
- casos similares
- card de recomendacao
- formulario de acao do advogado
- historico do caso

#### Card de recomendacao
Mostrar claramente:
- `Acao recomendada: Acordo` ou `Defesa`
- `Faixa sugerida: R$ X - R$ Y`
- `Confianca`
- `Principais motivos`
- `Regras usadas`
- `Risco economico esperado`

#### Formulario do advogado
Campos:
- seguir recomendacao? sim/nao
- acao escolhida
- valor ofertado
- motivo do override
- resultado da negociacao
- observacoes

### 4. PolicyLabPage
Objetivo:
- mostrar politica ativa e scorecard da calibracao.

Blocos minimos:
- policy version
- tabela de regras
- parametros de oferta
- resumo economico
- botao para recalibrar e publicar

---

## Implementacao LangGraph

### Graph 1: `policyCalibrationGraph`

Nos:

1. `loadHistoricalData`
2. `buildFeatureBuckets`
3. `proposePolicyRules`
4. `critiquePolicyRules`
5. `scorePolicyRules`
6. `publishPolicyVersion`

Fluxo:

```txt
loadHistoricalData
  -> buildFeatureBuckets
  -> proposePolicyRules
  -> critiquePolicyRules
  -> scorePolicyRules
  -> publishPolicyVersion
```

### Graph 2: `caseDecisionGraph`

Nos:

1. `ingestCase`
2. `extractFactsAction`
3. `extractFactsCritique`
4. `finalizeFacts`
5. `retrieveSimilarCases`
6. `scoreRisk`
7. `proposeDecisionAction`
8. `critiqueDecision`
9. `finalizeDecision`
10. `explainForLawyer`
11. `persistDecision`

Fluxo:

```txt
ingestCase
  -> extractFactsAction
  -> extractFactsCritique
  -> finalizeFacts
  -> retrieveSimilarCases
  -> scoreRisk
  -> proposeDecisionAction
  -> critiqueDecision
  -> finalizeDecision
  -> explainForLawyer
  -> persistDecision
```

### Regras de implementacao do LangGraph

- cada node retorna **apenas o delta do estado**;
- cada node deve registrar uma linha em `agent_runs`;
- se um node falhar, guardar erro em `errors` e abortar o fluxo com mensagem clara;
- validar toda saida de LLM com Zod antes de continuar;
- usar retries somente em erros transitivos de API.

---

## Prompts dos agentes

Nao usar prompt livre. Criar prompts pequenos, especificos e com JSON estrito.

### Prompt: Extract Facts Action

```txt
Voce e um extrator juridico. Use apenas o texto fornecido. Nao invente fatos.
Extraia os fatos relevantes para decidir entre acordo e defesa.
Retorne somente JSON valido no schema solicitado.
Sempre inclua referencias de evidencia por documento.
```

### Prompt: Extract Facts Critique

```txt
Voce e um critico de extracao. Sua funcao nao e reextrair tudo.
Verifique se a extracao possui fatos sem evidencia, contradicoes internas, lacunas ou baixa confianca.
Retorne somente JSON valido.
```

### Prompt: Propose Decision Action

```txt
Voce e um agente de politica de acordos.
Recebera fatos normalizados, score de risco e uma policy version.
Use apenas as regras presentes na policy e os fatos fornecidos.
Retorne uma proposta de decisao em JSON com action, usedRules e reasoning.
```

### Prompt: Critique Decision

```txt
Voce e um critico da recomendacao.
Nao crie uma nova decisao do zero.
Verifique se a recomendacao viola a policy, ignora fatos relevantes, usa regra errada ou explica mal a conclusao.
Retorne somente JSON valido.
```

### Prompt: Explain For Lawyer

```txt
Explique a recomendacao de forma curta, clara e acessivel para um advogado.
Nao use jargao tecnico de machine learning.
Explique acao recomendada, faixa sugerida, 3 principais motivos e principais riscos.
```

---

## Heuristicas e formulas do MVP

### Classificacao de riskBand

```ts
if (lossProbability >= 0.7) riskBand = "high";
else if (lossProbability >= 0.4) riskBand = "medium";
else riskBand = "low";
```

### Confidence inicial

Usar uma heuristica simples:

```txt
confidence = 0.5
+ 0.2 se houver regra dura aplicada
+ 0.1 se sampleSize de casos similares >= 30
+ 0.1 se critique passar sem issues high
+ 0.1 se evidenceRefs >= 3
cap em 0.95
```

### Adherence rate

```txt
aderencia = casos_em_que_o_advogado_seguiu_a_recomendacao / total_de_casos_com_acao_registrada
```

### Acceptance rate

```txt
taxa_aceite = acordos_aceitos / total_de_acordos_tentados
```

### Estimated savings

Heuristica simples para dashboard:

```txt
economia_estimada = soma(expected_judicial_cost - negotiation_value) para acordos aceitos
```

Quando nao houver `negotiation_value`, usar `offered_value`.

---

## Seed e dados de exemplo

O projeto precisa rodar com seed.

Criar:

- uma policy ativa inicial
- 20+ casos historicos seedados
- 2 casos de exemplo para demo
- regras iniciais seedadas

### Casos demo

#### Caso demo 1
- comprovante invalido ou ausente
- nenhum deposito compativel no extrato
- risco alto
- resultado esperado: `agreement`

#### Caso demo 2
- contrato + comprovante + deposito + dossie favoravel
- zero contradicoes
- risco baixo
- resultado esperado: `defense`

---

## Ordem recomendada de implementacao para o Codex

### Fase 1 - Scaffold
1. criar monorepo
2. configurar TypeScript
3. configurar apps `api` e `web`
4. configurar package shared

### Fase 2 - Persistencia
1. criar schema SQLite
2. criar client e repositorios
3. criar script de migracao
4. criar script de seed

### Fase 3 - Backend base
1. subir Fastify
2. implementar endpoints de cases e policies
3. implementar endpoints de dashboard

### Fase 4 - Workflow online
1. implementar types e schemas Zod
2. implementar `caseDecisionGraph`
3. implementar agentes action/critique/finalize
4. persistir analise no banco

### Fase 5 - Frontend
1. DashboardPage
2. CasesPage
3. CaseDetailPage
4. PolicyLabPage

### Fase 6 - Workflow offline
1. importar CSV historico
2. implementar `policyCalibrationGraph`
3. publicar politica

### Fase 7 - Acabamento
1. melhorar erros e loading states
2. adicionar logs de agent_runs
3. revisar seed e demo
4. escrever README com comandos

---

## Definition of Done do MVP

O MVP esta pronto quando:

1. `npm install` e `npm run dev` funcionarem localmente.
2. O backend abrir com SQLite inicializado e seed aplicado.
3. O frontend exibir casos de exemplo.
4. Ao clicar em `Analisar caso`, o workflow online rodar e devolver uma recomendacao real.
5. O advogado conseguir registrar sua acao.
6. O dashboard mostrar aderencia, aceite e economia estimada.
7. A PolicyLab mostrar a versao da politica e suas regras.
8. O projeto tiver um README com setup e comandos.

---

## Nao fazer no MVP

Para manter o escopo viavel, **nao fazer agora**:

- autenticacao complexa
- multi-tenant
- OCR pesado
- upload de PDF com parser complexo como dependencia central do fluxo
- embeddings, vetor DB e busca semantica sofisticada
- filas assicronas complexas
- treinamento de modelo customizado

Se necessario, aceitar inicialmente `textContent` ou fixtures JSON para demonstrar o fluxo.

---

## Prompt inicial sugerido para usar com o Codex

Use este prompt como ponto de partida em uma sessao nova do Codex:

```txt
Leia o arquivo AGENTS.md e implemente exatamente o que esta especificado.
Quero um monorepo executavel com Node.js + TypeScript no backend, React + Vite no frontend, SQLite como banco e LangGraph para orquestrar os 2 workflows descritos.

Prioridades:
1. scaffold do projeto
2. schema SQLite e seeds
3. endpoints Fastify
4. workflow online de analise de caso com action-critique-finalize
5. telas do frontend para dashboard, lista de casos, detalhe do caso e policy lab
6. workflow offline de calibracao de policy

Regras importantes:
- nao use pseudocodigo
- nao deixe TODOs em partes criticas
- gere codigo executavel
- use Zod para validar output dos agentes
- persista tudo em SQLite
- crie dados seedados para 2 casos demo
- o projeto deve rodar com npm install && npm run dev

Comece criando a estrutura de pastas, o package.json raiz, os package.json de apps/packages e o schema SQLite.
Depois implemente o backend antes do frontend.
```

---

## Observacao final para o Codex

Se houver ambiguidade, preferir:

- simplicidade
- executabilidade
- auditabilidade
- demonstracao clara do fluxo do advogado

Este projeto deve parecer um **motor de politica de acordos auditavel**, e nao apenas um chat juridico.
