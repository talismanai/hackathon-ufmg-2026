# Integração Frontend x Backend

## Objetivo

Este documento descreve a organização do frontend do projeto **Banco UFMG - Legal Analytics** e detalha as **rotas de backend** necessárias para suportar os fluxos já implementados na aplicação React.

O foco aqui não é a camada visual, e sim o contrato técnico entre:

- páginas do frontend;
- serviços em [`src/services/api.ts`](./src/services/api.ts);
- tipos em [`src/types/case.ts`](./src/types/case.ts);
- endpoints que o backend precisará disponibilizar.

---

## 1. Arquitetura do Frontend

### Stack

- React
- Vite
- TypeScript
- React Router v6
- TailwindCSS
- lucide-react
- recharts

### Organização por responsabilidade

```text
src/
├── components/
│   ├── layout/     # Shell global: Sidebar, TopBar, Layout
│   └── ui/         # Componentes visuais reutilizáveis
├── hooks/          # Hooks de acesso à camada de serviços
├── pages/          # Páginas roteáveis do sistema
├── routes/         # Configuração das rotas React Router
├── services/       # Integração com backend / mocks atuais
└── types/          # Contratos TypeScript de domínio
```

### Fluxo técnico interno

O fluxo padrão no frontend segue esta sequência:

1. O usuário acessa uma rota configurada em [`src/routes/AppRouter.tsx`](./src/routes/AppRouter.tsx).
2. A página correspondente em `src/pages/` é carregada.
3. Quando necessário, a página chama uma função da camada de serviços em [`src/services/api.ts`](./src/services/api.ts).
4. A resposta é tipada com os contratos definidos em [`src/types/case.ts`](./src/types/case.ts).
5. A UI atualiza estado local e, em alguns casos, redireciona com `useNavigate()`.

### Layout compartilhado

O layout da aplicação já está consolidado em:

- [`src/components/layout/Layout.tsx`](./src/components/layout/Layout.tsx)
- [`src/components/layout/Sidebar.tsx`](./src/components/layout/Sidebar.tsx)
- [`src/components/layout/TopBar.tsx`](./src/components/layout/TopBar.tsx)

Esse layout envolve todas as páginas e não depende diretamente do backend. A integração real acontece nas páginas e na camada `services/`.

---

## 2. Rotas do Frontend

As rotas do frontend estão definidas em [`src/routes/AppRouter.tsx`](./src/routes/AppRouter.tsx).

| Rota frontend | Página | Arquivo | Papel funcional |
|------|--------|---------|-----------------|
| `/` | Dashboard | `src/pages/Dashboard/index.tsx` | Visão consolidada de indicadores e auditoria |
| `/dashboard` | Dashboard | `src/pages/Dashboard/index.tsx` | Alias da rota principal |
| `/novo-processo` | Novo Processo | `src/pages/NovoProcesso/index.tsx` | Submissão de novo caso e upload de PDFs |
| `/resultado/:caseId` | Resultado | `src/pages/Resultado/index.tsx` | Visualização da análise do caso |
| `/consultar` | Consultar Processo | `src/pages/ConsultarProcesso/index.tsx` | Busca de casos por número do processo |

### Como essas rotas se conectam com o backend

#### `/novo-processo`

Essa rota inicia um novo fluxo de análise. O frontend coleta:

- número do processo;
- nome do cliente;
- categoria;
- prioridade;
- lista de PDFs.

Ao submeter, chama `submitCase(payload)` e espera receber um `caseId`.

Depois disso, redireciona para:

```text
/resultado/:caseId
```

#### `/resultado/:caseId`

Essa rota depende diretamente do backend. Ela precisa receber o `caseId` na URL e buscar os dados completos do caso com `getCaseResult(caseId)`.

Sem essa rota de backend, a página não consegue renderizar o resultado final do processo.

#### `/consultar`

Essa rota faz busca por número CNJ usando `searchCase(processNumber)`.

Se houver resultado, a página recebe um resumo do caso, renderiza o card de retorno e permite navegar para:

```text
/resultado/:caseId
```

#### `/dashboard`

Hoje o dashboard usa dados locais mockados. Porém, para produção, será natural que o backend também disponibilize endpoints de:

- KPIs;
- distribuição de divergências;
- séries temporais de custo;
- lista auditável de processos divergentes.

Esses endpoints ainda não são obrigatórios para o app compilar, mas são necessários para o dashboard operar com dados reais.

---

## 3. Camada de Serviços do Frontend

O arquivo central de integração hoje é:

- [`src/services/api.ts`](./src/services/api.ts)

Atualmente ele contém funções assíncronas mockadas, com `console.log(...)`, atraso artificial e retorno de dados em memória.

As funções implementadas hoje são:

| Função | Arquivo consumidor principal | Objetivo |
|------|-------------------------------|----------|
| `submitCase(payload)` | `src/pages/NovoProcesso/index.tsx` | Criar um novo caso |
| `getCaseResult(caseId)` | `src/pages/Resultado/index.tsx` | Buscar análise completa por ID |
| `searchCase(processNumber)` | `src/pages/ConsultarProcesso/index.tsx` | Buscar caso pelo número do processo |

Também existe o hook:

- [`src/hooks/useCase.ts`](./src/hooks/useCase.ts)

Esse hook apenas repassa essas funções e pode ser usado futuramente para encapsular:

- tratamento de erro;
- estado de loading;
- integração com React Query ou SWR;
- autenticação automática.

---

## 4. Tipos que o Backend Precisa Respeitar

Todos os contratos de domínio usados hoje estão em:

- [`src/types/case.ts`](./src/types/case.ts)

Os principais tipos consumidos pelas páginas são:

### `CaseMetadata`

Usado na tela de busca (`/consultar`).

```ts
interface CaseMetadata {
  caseId: string;
  processNumber: string;
  clientName: string;
  vara: string;
  dataFato: string;
  verdictRecommendation: "Acordo" | "Defesa";
  status: "processing" | "completed" | "reviewed";
}
```

### `CaseResult`

Usado na tela de resultado (`/resultado/:caseId`).

```ts
interface CaseResult {
  caseId: string;
  processNumber: string;
  clientName: string;
  vara: string;
  dataFato: string;
  complexidade: "Baixa" | "Média" | "Alta";
  advogado: {
    name: string;
    initials: string;
  };
  verdict: {
    recommendation: "Acordo" | "Defesa";
    probability: number;
    similarCases: number;
    tetoSugerido?: number;
  };
  topics: Array<{
    id: string;
    title: string;
    description: string;
    lawyerDecision?: "approved" | "disagreed" | "pending";
  }>;
  generatedAt: string;
}
```

### `SubmitCasePayload`

Definido em [`src/services/api.ts`](./src/services/api.ts) e usado na tela `/novo-processo`.

```ts
interface SubmitCasePayload {
  processNumber: string;
  clientName?: string;
  category?: "Cível" | "Trabalhista" | "Criminal" | "Tributário";
  priority?: "Baixa" | "Média" | "Alta";
  files: File[];
}
```

Importante: esse tipo representa o formato interno usado pelo frontend. No backend, a implementação mais provável para arquivos será `multipart/form-data`.

---

## 5. Rotas de Backend Necessárias

Esta é a parte principal do documento.

### 5.1 `POST /api/cases`

#### Finalidade

Criar um novo caso a partir dos metadados preenchidos na página `Novo Processo` e dos PDFs enviados.

#### Chamado por

- [`src/pages/NovoProcesso/index.tsx`](./src/pages/NovoProcesso/index.tsx)

#### Fluxo no frontend

1. O usuário preenche os campos da triagem.
2. O usuário faz upload de um ou mais PDFs.
3. O frontend chama:

```ts
submitCase({
  processNumber,
  clientName,
  category,
  priority,
  files,
})
```

4. Se a resposta for bem-sucedida, o frontend navega para:

```ts
/resultado/:caseId
```

#### Payload esperado

Se o backend usar `multipart/form-data`, a recomendação é:

- `processNumber`
- `clientName`
- `category`
- `priority`
- `files[]`

Exemplo lógico do payload:

```json
{
  "processNumber": "0801234-56.2024.8.10.0001",
  "clientName": "Maria de Lourdes Silva",
  "category": "Cível",
  "priority": "Média"
}
```

Arquivos PDF devem seguir em partes anexas.

#### Resposta mínima obrigatória

```json
{
  "caseId": "case-2418A"
}
```

#### Regras importantes

- `caseId` precisa ser estável e único.
- O frontend depende desse ID para redirecionar.
- O endpoint não precisa devolver a análise completa neste momento; apenas o `caseId` já é suficiente para o fluxo atual.

---

### 5.2 `GET /api/cases/:caseId`

#### Finalidade

Retornar o resultado consolidado da análise de um caso específico.

#### Chamado por

- [`src/pages/Resultado/index.tsx`](./src/pages/Resultado/index.tsx)

#### Fluxo no frontend

1. A página lê `caseId` com `useParams()`.
2. Chama:

```ts
getCaseResult(caseId)
```

3. Enquanto aguarda, a tela mostra um painel de processamento.
4. Quando a resposta chega, renderiza:
   - cabeçalho do caso;
   - painel `AI VERDICT`;
   - metadados do caso;
   - tópicos da matriz de decisão.

#### Resposta esperada

O backend deve retornar um objeto compatível com `CaseResult`.

Exemplo:

```json
{
  "caseId": "case-2418A",
  "processNumber": "0801234-56.2024.8.10.0001",
  "clientName": "Maria de Lourdes Silva",
  "vara": "12ª Vara Cível de Belo Horizonte",
  "dataFato": "2025-01-12",
  "complexidade": "Média",
  "advogado": {
    "name": "Fernanda Costa",
    "initials": "FC"
  },
  "verdict": {
    "recommendation": "Acordo",
    "probability": 0.72,
    "similarCases": 214,
    "tetoSugerido": 18750
  },
  "topics": [
    {
      "id": "prescricional",
      "title": "Validade Prescricional",
      "description": "Texto analítico gerado para o tópico"
    }
  ],
  "generatedAt": "2026-04-17T21:15:00.000Z"
}
```

#### Regras importantes

- `topics` precisa sempre existir como array.
- `probability` deve ser um número entre `0` e `1`.
- `tetoSugerido` pode ser omitido quando a recomendação for `Defesa`.
- `advogado.initials` é usado diretamente no avatar do card lateral.

---

### 5.3 `GET /api/cases/search?processNumber=...`

#### Finalidade

Localizar um caso pelo número do processo.

#### Chamado por

- [`src/pages/ConsultarProcesso/index.tsx`](./src/pages/ConsultarProcesso/index.tsx)

#### Fluxo no frontend

1. O usuário digita o número do processo com máscara CNJ.
2. O frontend chama:

```ts
searchCase(processNumber)
```

3. Se o backend encontrar o caso:
   - retorna `CaseMetadata`;
   - a UI mostra o resumo;
   - o botão `Ver Análise Completa` navega para `/resultado/:caseId`.
4. Se não encontrar:
   - retorna `null`;
   - a UI mostra estado vazio.

#### Resposta esperada quando encontrado

```json
{
  "caseId": "case-2418A",
  "processNumber": "0801234-56.2024.8.10.0001",
  "clientName": "Maria de Lourdes Silva",
  "vara": "12ª Vara Cível de Belo Horizonte",
  "dataFato": "2025-01-12",
  "verdictRecommendation": "Acordo",
  "status": "completed"
}
```

#### Resposta esperada quando não encontrado

```json
null
```

#### Regras importantes

- O backend deve aceitar busca com ou sem máscara.
- Recomenda-se normalizar o CNJ removendo caracteres não numéricos antes da busca.

---

## 6. Rota Recomendada para Persistência do Parecer

Hoje a página `Resultado` permite que o advogado:

- aprove um tópico;
- discorde de um tópico;
- justifique a divergência em texto.

No entanto, esse estado ainda é somente local.

Para fechar o fluxo completo, recomenda-se criar a seguinte rota:

### `POST /api/cases/:caseId/opinion`

#### Finalidade

Persistir o parecer final do advogado sobre os tópicos da análise.

#### Payload sugerido

```json
{
  "topics": [
    {
      "id": "prescricional",
      "decision": "approved",
      "note": ""
    },
    {
      "id": "jurisprudencia",
      "decision": "disagreed",
      "note": "Precedente interno diverge da recomendação do agente."
    }
  ]
}
```

#### Resposta sugerida

```json
{
  "success": true,
  "status": "reviewed"
}
```

#### Benefício

Essa rota permitiria:

- atualizar `CaseStatus` para `reviewed`;
- registrar divergências técnicas;
- alimentar o dashboard com taxa de aderência entre IA e parecer humano.

---

## 7. Rotas Recomendadas para o Dashboard

Atualmente o dashboard usa dados hardcoded em:

- [`src/pages/Dashboard/index.tsx`](./src/pages/Dashboard/index.tsx)

Para colocar essa tela em produção, recomenda-se expor endpoints dedicados.

### 7.1 `GET /api/dashboard/kpis`

#### Retorno sugerido

```json
{
  "taxaAderencia": {
    "value": 94.2,
    "trend": "+1,2% vs mês anterior"
  },
  "economiaGerada": {
    "value": 4200000,
    "trend": "+8,4% YTD"
  },
  "tempoMedioFechamento": {
    "value": 42,
    "unit": "dias",
    "trend": "-3 dias trend"
  },
  "efetividade": {
    "value": 88.5,
    "trend": "+0,5% resultados favoráveis"
  }
}
```

### 7.2 `GET /api/dashboard/cost-variance`

#### Retorno sugerido

```json
[
  { "month": "JAN", "previsto": 2.4, "real": 1.9 },
  { "month": "FEV", "previsto": 2.8, "real": 2.1 }
]
```

### 7.3 `GET /api/dashboard/divergence-reasons`

#### Retorno sugerido

```json
[
  { "name": "Questões Probatórias", "value": 45, "color": "#0f2044" },
  { "name": "Nova Jurisprudência", "value": 30, "color": "#5473c7" }
]
```

### 7.4 `GET /api/dashboard/divergent-cases`

#### Retorno sugerido

```json
[
  {
    "caseId": "case-2418A",
    "processId": "0801234-56.2024.8.10.0001",
    "escritorio": "Costa & Associados",
    "previsto": 17800,
    "real": 24500,
    "variancia": "+37,6%",
    "status": "DIVERGENTE"
  }
]
```

#### Observação

Essas rotas ainda não são obrigatórias para o fluxo de submissão e consulta funcionar, mas são necessárias para o dashboard refletir dados reais.

---

## 8. Mapeamento Página -> Serviço -> Rota de Backend

| Página | Serviço chamado | Rota backend necessária | Resposta esperada |
|------|------------------|-------------------------|-------------------|
| `NovoProcessoPage` | `submitCase(payload)` | `POST /api/cases` | `{ caseId: string }` |
| `ResultadoPage` | `getCaseResult(caseId)` | `GET /api/cases/:caseId` | `CaseResult` |
| `ConsultarProcessoPage` | `searchCase(processNumber)` | `GET /api/cases/search?processNumber=...` | `CaseMetadata \| null` |
| `ResultadoPage` | persistência futura do parecer | `POST /api/cases/:caseId/opinion` | confirmação de gravação |
| `DashboardPage` | integração futura | `GET /api/dashboard/*` | KPIs, gráficos e auditoria |

---

## 9. Considerações Técnicas para o Backend

### CORS

Durante desenvolvimento local, o backend deve permitir requisições originadas de:

```text
http://localhost:5173
```

### Autenticação

O frontend ainda não implementa autenticação, mas a API deve prever uma estratégia futura, como:

- `Authorization: Bearer <token>`;
- sessão via cookie HTTP-only;
- SSO corporativo.

### Erros padronizados

É recomendável retornar erros em formato consistente:

```json
{
  "error": {
    "code": "CASE_NOT_FOUND",
    "message": "Caso não localizado."
  }
}
```

### Datas

Os campos `dataFato` e `generatedAt` devem ser enviados em formato serializável e consistente, preferencialmente ISO 8601.

### Upload de arquivos

Como a rota `POST /api/cases` recebe PDFs, o backend deve definir claramente:

- limite máximo por arquivo;
- quantidade máxima de arquivos por submissão;
- MIME aceito;
- estratégia de armazenamento;
- política de antivírus e validação.

---

## 10. Resumo Executivo

O frontend já está organizado em camadas claras:

- `pages/` para fluxo de negócio;
- `services/` para integração;
- `types/` para contratos;
- `routes/` para navegação.

Para que os fluxos principais operem com backend real, as rotas mínimas necessárias são:

1. `POST /api/cases`
2. `GET /api/cases/:caseId`
3. `GET /api/cases/search?processNumber=...`

Para completar o fluxo jurídico de revisão humana, a rota adicional recomendada é:

4. `POST /api/cases/:caseId/opinion`

E para alimentar o dashboard com dados produtivos, recomenda-se expor também um conjunto de rotas sob:

5. `GET /api/dashboard/*`

Com essas rotas implementadas respeitando os contratos descritos aqui e em [`src/types/case.ts`](./src/types/case.ts), o frontend já terá base suficiente para operar sem mocks.
