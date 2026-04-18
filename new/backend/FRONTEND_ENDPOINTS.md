# Frontend Endpoints

Base local padrao do `new/backend`:

- `http://127.0.0.1:3001`

## Health

### `GET /health`

Uso:
- verificar se a API do `new/backend` esta no ar

Resposta:
```json
{
  "status": "ok",
  "service": "new-backend"
}
```

## Workflow 1

### `POST /api/policy-generator/generate`

Uso:
- disparar a geracao/calibracao da policy

Body:
```json
{
  "runId": "manual-new-policy-001",
  "inputCsvPath": "/caminho/opcional/arquivo.csv",
  "logsPath": "./logs/opcional"
}
```

Resposta:
```json
{
  "runId": "manual-new-policy-001",
  "transcriptPath": "/abs/path/transcript.txt",
  "traceViewerUrl": "/api/traces/policy_calibration/manual-new-policy-001/view",
  "traceJsonUrl": "/api/traces/policy_calibration/manual-new-policy-001",
  "summary": {
    "runId": "manual-new-policy-001",
    "errors": [],
    "critiqueReport": {},
    "scorecard": {},
    "publishedPolicy": {}
  },
  "publishedPolicy": {},
  "errors": []
}
```

## Workflow 2

### `POST /api/case-analyzer/submit`

Uso:
- criar ou reutilizar um caso
- receber documentos
- salvar arquivos localmente
- rodar a analise completa

Body:
```json
{
  "caseInput": {
    "externalCaseNumber": "CASE-001",
    "plaintiffName": "Maria da Silva",
    "processType": "Nao reconhece operacao",
    "uf": "MG",
    "claimAmountCents": 1500000
  },
  "documents": [
    {
      "docType": "autos",
      "fileName": "autos.txt",
      "textContent": "A autora nao reconhece a contratacao."
    },
    {
      "docType": "extrato",
      "fileName": "extrato.txt",
      "textContent": "Extrato sem deposito identificado."
    },
    {
      "docType": "dossie",
      "fileName": "dossie.txt",
      "textContent": "Dossie inconclusivo."
    }
  ]
}
```

Campos opcionais:
- `caseId`
- `policyVersion`
- `caseInput`

Resposta:
```json
{
  "caseId": "case_123",
  "analysisId": "analysis_123",
  "transcriptPath": "/abs/path/transcript.txt",
  "traceViewerUrl": "/api/traces/case_decision/case_123/view",
  "traceJsonUrl": "/api/traces/case_decision/case_123",
  "caseRecord": {},
  "documents": [],
  "localFiles": [],
  "decision": {},
  "lawyerExplanation": "Texto final para o advogado.",
  "errors": []
}
```

### `GET /api/case-analyzer/result?caseId=<CASE_ID>`

Uso:
- buscar a resposta final da analise de um caso ja processado
- ideal para o front consultar o resultado depois do submit

Exemplo:
```txt
GET /api/case-analyzer/result?caseId=cmo_case_123
```

Resposta:
```json
{
  "caseId": "cmo_case_123",
  "analysisId": "cmo_analysis_123",
  "transcriptPath": "/abs/path/transcript.txt",
  "traceViewerUrl": "/api/traces/case_decision/cmo_case_123/view",
  "traceJsonUrl": "/api/traces/case_decision/cmo_case_123",
  "caseRecord": {},
  "analysis": {},
  "decision": {},
  "lawyerExplanation": "Texto final para o advogado.",
  "errors": []
}
```

Erros esperados:
- `404` quando o caso nao existe
- `409` quando o caso existe, mas ainda nao tem analise final

## Dashboard

### `GET /api/dashboard/analytics`

Uso:
- consolidar dados para dashboard do front

Resposta:
```json
{
  "summary": {},
  "adherence": {},
  "effectiveness": {}
}
```

## Status

### `GET /api/status?caseId=<CASE_ID>`

Uso:
- consultar o estado do caso

Resposta:
```json
{
  "caseId": "cmo_case_123",
  "status": "analyzed"
}
```

## Traces

### `GET /api/traces/:workflowType/:executionId`

Uso:
- obter o fluxo estruturado em JSON

Valores:
- `workflowType = policy_calibration`
- `workflowType = case_decision`

### `GET /api/traces/:workflowType/:executionId/view`

Uso:
- abrir o viewer HTML do fluxo

Exemplos:
- `/api/traces/policy_calibration/manual-new-policy-001`
- `/api/traces/policy_calibration/manual-new-policy-001/view`
- `/api/traces/case_decision/cmo_case_123`
- `/api/traces/case_decision/cmo_case_123/view`

## Resumo Rapido

Rotas mais importantes para o front:

- `GET /health`
- `POST /api/policy-generator/generate`
- `POST /api/case-analyzer/submit`
- `GET /api/case-analyzer/result?caseId=...`
- `GET /api/dashboard/analytics`
- `GET /api/status?caseId=...`
- `GET /api/traces/:workflowType/:executionId`
- `GET /api/traces/:workflowType/:executionId/view`
