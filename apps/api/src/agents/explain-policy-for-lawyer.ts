import type { PolicyCalibrationState } from "@grupo4/shared";

import type { AgentTraceContext } from "../lib/agent-transcript.js";
import { invokeTextWithFallback } from "../lib/llm.js";
import { explainPolicyForLawyerPrompt } from "../prompts/policy-calibration.js";

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2)}`;
}

async function explainPolicyForLawyerDeterministically(
  state: Pick<
    PolicyCalibrationState,
    "candidateRules" | "scorecard" | "datasetSplit" | "calibrationAttempt"
  >
): Promise<string> {
  const scorecard = state.scorecard;
  const datasetSplit = state.datasetSplit;
  const agreementRules = state.candidateRules.filter(
    (rule) => rule.action === "agreement"
  );
  const defenseRules = state.candidateRules.filter(
    (rule) => rule.action === "defense"
  );
  const reviewRules = state.candidateRules.filter(
    (rule) => rule.action === "review"
  );

  const lines = [
    "Resumo da politica de acordos para leitura do advogado.",
    datasetSplit
      ? `A politica foi calibrada com ${datasetSplit.trainRows} casos de treino e validada com ${datasetSplit.testRows} casos de teste, em uma separacao deterministica 70/30.`
      : "A politica foi calibrada sobre o historico disponivel.",
    scorecard
      ? `Na base de teste, a politica atingiu score de ${formatPercent(scorecard.policyScore)}, com cobertura direta de ${formatPercent(scorecard.coverageRate)} e economia estimada de ${formatCurrency(scorecard.estimatedSavings)} frente ao baseline sempre defender.`
      : "O score final da politica ainda nao foi calculado.",
    agreementRules.length > 0
      ? `Em termos praticos, a recomendacao de acordo aparece principalmente quando os buckets historicos mostram perda alta para o banco, como nos cenarios: ${agreementRules
          .slice(0, 3)
          .map((rule) => rule.conditionSummary)
          .join("; ")}.`
      : "A politica nao gerou regra clara de acordo nesta rodada.",
    defenseRules.length > 0
      ? `A recomendacao de defesa aparece quando ha historico favoravel ao banco e melhor qualidade documental, especialmente em cenarios como: ${defenseRules
          .slice(0, 3)
          .map((rule) => rule.conditionSummary)
          .join("; ")}.`
      : "A politica nao gerou regra clara de defesa nesta rodada.",
    reviewRules.length > 0
      ? `Casos em faixa intermediaria de risco permanecem para revisao humana em ${reviewRules.length} regra(s), para evitar automatizar situacoes ambíguas.`
      : "Nesta versao, os casos sem regra dura caem no fallback economico da politica.",
    `Foram necessarias ${state.calibrationAttempt} tentativa(s) de calibracao para chegar a esta versao.`
  ];

  return lines.join(" ");
}

export async function explainPolicyForLawyer(
  state: Pick<
    PolicyCalibrationState,
    "candidateRules" | "scorecard" | "datasetSplit" | "calibrationAttempt"
  >,
  trace?: AgentTraceContext
): Promise<string> {
  return invokeTextWithFallback({
    systemPrompt: explainPolicyForLawyerPrompt,
    userPrompt: [
      "Explique esta policy para um advogado em linguagem simples.",
      JSON.stringify(
        {
          calibrationAttempt: state.calibrationAttempt,
          datasetSplit: state.datasetSplit,
          scorecard: state.scorecard,
          candidateRules: state.candidateRules
        },
        null,
        2
      )
    ].join("\n\n"),
    trace,
    fallback: () => explainPolicyForLawyerDeterministically(state)
  });
}
