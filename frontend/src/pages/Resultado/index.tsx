import {
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { getCaseResult, submitCaseFeedback } from "@/services/api";
import type { CaseResult, LawyerDecision } from "@/types/case";

type TopicDecisions = Record<
  string,
  {
    decision: LawyerDecision;
    note: string;
  }
>;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(value));
}

function complexityTone(complexidade: CaseResult["complexidade"]) {
  if (complexidade === "Alta") {
    return "warning";
  }

  if (complexidade === "Média") {
    return "info";
  }

  return "success";
}

function buildVerdictProbabilityText(result: CaseResult) {
  const probability = Math.round(result.verdict.probability * 100);

  if (result.verdict.similarCases > 0) {
    return `Risco estimado de perda do banco em ${probability}%, com base em ${result.verdict.similarCases} casos similares analisados pelo backend.`;
  }

  return `Risco estimado de perda do banco em ${probability}%, conforme a avaliação consolidada do backend para este processo.`;
}

function buildVerdictTitle(result: CaseResult) {
  if (result.verdict.recommendation === "Acordo") {
    return "Recomendação: Acordo";
  }

  if (result.verdict.recommendation === "Revisão") {
    return "Recomendação: Revisão";
  }

  return "Recomendação: Defesa";
}

function getResultBadge(result: CaseResult) {
  if (result.resultStatus === "approved") {
    return {
      label: "PARECER APROVADO",
      tone: "success" as const,
    };
  }

  if (result.resultStatus === "rejected") {
    return {
      label: "PARECER REPROVADO",
      tone: "warning" as const,
    };
  }

  return {
    label: "AGUARDANDO PARECER",
    tone: "warning" as const,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "404" || error.message === "Caso não encontrado") {
      return "Caso não encontrado.";
    }

    if (
      error.message === "Tempo limite excedido para processamento do caso"
    ) {
      return "O caso ainda não concluiu o processamento dentro do tempo esperado.";
    }

    return error.message;
  }

  return "Não foi possível carregar o resultado do caso.";
}

function buildFeedbackText(
  result: CaseResult,
  topicDecisions: TopicDecisions,
) {
  const lines = result.topics.map((topic) => {
    const state = topicDecisions[topic.id];
    const status =
      state?.decision === "approved" ? "APROVADO" : "REPROVADO";
    const note =
      state?.decision === "disagreed" && state.note.trim()
        ? ` Justificativa: ${state.note.trim()}`
        : "";

    return `[${status}] ${topic.title}.${note}`;
  });

  return lines.join("\n");
}

export function ResultadoPage() {
  // Resultado page purpose: exibir o parecer do Agente IA, permitir aprovação ou divergência por tópico e consolidar o parecer jurídico.
  const { caseId } = useParams();
  const navigate = useNavigate();

  const [result, setResult] = useState<CaseResult | null>(null);
  const [topicDecisions, setTopicDecisions] = useState<TopicDecisions>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");

  useEffect(() => {
    if (!caseId) {
      setErrorMessage("Caso não encontrado.");
      setIsLoading(false);
      return;
    }

    let isActive = true;

    setIsLoading(true);
    setErrorMessage("");
    setFeedbackMessage("");
    setResult(null);
    setTopicDecisions({});

    void getCaseResult(caseId)
      .then((response) => {
        if (!isActive) {
          return;
        }

        setResult(response);
        setIsLoading(false);
      })
      .catch((error) => {
        if (isActive) {
          setErrorMessage(getErrorMessage(error));
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [caseId]);

  const allTopicsDecided = useMemo(() => {
    if (!result) {
      return false;
    }

    return result.topics.every((topic) => {
      const decision = topicDecisions[topic.id]?.decision;
      return decision === "approved" || decision === "disagreed";
    });
  }, [result, topicDecisions]);

  const resultBadge = useMemo(
    () => (result ? getResultBadge(result) : null),
    [result],
  );
  const isReadOnly = result?.resultStatus !== "pending";

  async function handleConfirmFeedback() {
    if (!result || !allTopicsDecided || isReadOnly) {
      return;
    }

    setIsSubmittingFeedback(true);
    setErrorMessage("");
    setFeedbackMessage("");

    try {
      const approvalStatus = result.topics.every(
        (topic) => topicDecisions[topic.id]?.decision === "approved",
      )
        ? "approved"
        : "rejected";

      await submitCaseFeedback(result.caseId, {
        analysisId: result.analysisId,
        approvalStatus,
        feedbackText: buildFeedbackText(result, topicDecisions),
      });

      setResult((current) =>
        current
          ? {
              ...current,
              resultStatus: approvalStatus,
            }
          : current,
      );
      setFeedbackMessage("Parecer salvo com sucesso.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="page-card w-full max-w-xl p-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-white px-4 py-2 text-sm text-slate-600">
            <Spinner className="text-brand-navy" />
            Carregando análise do processo...
          </div>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="page-card w-full max-w-2xl p-8 text-center">
          <h1 className="mt-6 text-3xl font-bold text-[#1a1a2e]">
            Não foi possível carregar a análise
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            {errorMessage || "Ocorreu um erro ao consultar o backend."}
          </p>
          <Button className="mt-6" onClick={() => navigate(-1)} variant="secondary">
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.45fr_0.92fr]">
      <section className="space-y-6">
        <div className="page-card p-6 lg:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>Processos</span>
                <ChevronRight className="h-4 w-4" />
                <span>Case #{result.caseId}</span>
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#1a1a2e]">
                Análise de Processo: {result.clientName} vs. Banco UFMG
              </h1>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Ação Indenizatória Cível - {result.vara}
              </p>
            </div>

            {resultBadge ? (
              <Badge tone={resultBadge.tone} className="h-fit self-start">
                {resultBadge.label}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="page-card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
                MATRIZ DE DECISÃO OPERACIONAL
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Avalie cada tópico sugerido pelo Agente IA antes de confirmar o
                parecer técnico.
              </p>
            </div>
            <ShieldCheck className="h-5 w-5 text-brand-navy" />
          </div>

          <div className="mt-6 space-y-4">
            {result.topics.map((topic) => {
              const state = topicDecisions[topic.id] ?? {
                decision: "pending" as LawyerDecision,
                note: "",
              };

              return (
                <article
                  key={topic.id}
                  className="rounded-[8px] border border-border-soft bg-[#fbfcfe] p-5"
                >
                  <h2 className="text-lg font-semibold text-[#1a1a2e]">
                    {topic.title}
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {topic.description}
                  </p>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <button
                      className={[
                        "min-h-11 rounded-[8px] border px-4 text-sm font-medium transition",
                        state.decision === "approved"
                          ? "border-brand-navy bg-brand-navy text-white"
                          : "border-brand-navy/30 bg-white text-brand-navy hover:bg-mist",
                        isReadOnly ? "cursor-not-allowed opacity-60" : "",
                      ].join(" ")}
                      disabled={isReadOnly}
                      onClick={() =>
                        setTopicDecisions((current) => ({
                          ...current,
                          [topic.id]: {
                            decision: "approved",
                            note: current[topic.id]?.note ?? "",
                          },
                        }))
                      }
                      type="button"
                    >
                      Aprovar
                    </button>

                    <button
                      className={[
                        "min-h-11 rounded-[8px] border px-4 text-sm font-medium transition",
                        state.decision === "disagreed"
                          ? "border-red-600 bg-red-600 text-white"
                          : "border-border-soft bg-white text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-600",
                        isReadOnly ? "cursor-not-allowed opacity-60" : "",
                      ].join(" ")}
                      disabled={isReadOnly}
                      onClick={() =>
                        setTopicDecisions((current) => ({
                          ...current,
                          [topic.id]: {
                            decision: "disagreed",
                            note: current[topic.id]?.note ?? "",
                          },
                        }))
                      }
                      type="button"
                    >
                      Discordar
                    </button>
                  </div>

                  {state.decision === "disagreed" ? (
                    <div className="mt-4">
                      <label className="block space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-red-600">
                          JUSTIFIQUE TECNICAMENTE A DIVERGÊNCIA...
                        </span>
                        <textarea
                          className="min-h-32 w-full rounded-[8px] border border-red-100 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-red-200 focus:ring-2 focus:ring-red-100"
                          disabled={isReadOnly}
                          onChange={(event) =>
                            setTopicDecisions((current) => ({
                              ...current,
                              [topic.id]: {
                                decision: "disagreed",
                                note: event.target.value,
                              },
                            }))
                          }
                          placeholder="Insira fundamentação legal ou precedente interno..."
                          value={state.note}
                        />
                      </label>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          {isReadOnly ? (
            <p className="mt-6 rounded-[8px] border border-border-soft bg-[#f8fafc] px-4 py-3 text-sm text-slate-600">
              Este parecer já foi registrado anteriormente e está bloqueado para edição.
            </p>
          ) : (
            <Button
              className="mt-6"
              disabled={!allTopicsDecided}
              isLoading={isSubmittingFeedback}
              onClick={handleConfirmFeedback}
              size="lg"
              variant="primary"
            >
              <CheckCircle2 className="h-4 w-4" />
              Confirmar Parecer
            </Button>
          )}

          {feedbackMessage ? (
            <p className="mt-3 text-sm text-emerald-700">{feedbackMessage}</p>
          ) : null}

          {!isLoading && errorMessage && result ? (
            <p className="mt-3 text-sm text-red-600">{errorMessage}</p>
          ) : null}
        </div>
      </section>

      <aside className="space-y-6">
        <div className="rounded-[8px] border border-[#d7e2f1] bg-[#e8eef7] p-6">
          <div className="flex items-center gap-3 text-brand-navy">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-[0.16em]">
              AI VERDICT
            </span>
          </div>

          <h2 className="mt-5 text-3xl font-bold tracking-tight text-[#1a1a2e]">
            {buildVerdictTitle(result)}
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-700">
            {result.verdict.explanationShort}
          </p>

          <p className="mt-4 text-sm leading-7 text-slate-700">
            {buildVerdictProbabilityText(result)}
          </p>

          {result.verdict.detailedExplanation ? (
            <p className="mt-4 text-sm leading-7 text-slate-700">
              {result.verdict.detailedExplanation}
            </p>
          ) : null}

          {result.verdict.recommendation === "Acordo" &&
          result.verdict.tetoSugerido ? (
            <p className="mt-4 text-lg font-semibold text-brand-navy">
              Teto Sugerido: {formatCurrency(result.verdict.tetoSugerido)}
            </p>
          ) : null}
        </div>

        <div className="page-card p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
            CASE METADATA
          </p>

          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-500">Data do Fato</span>
              <span className="text-sm font-medium text-[#1a1a2e]">
                {formatDate(result.dataFato)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-500">Vara</span>
              <span className="text-right text-sm font-medium text-[#1a1a2e]">
                {result.vara}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-500">Complexidade</span>
              <Badge tone={complexityTone(result.complexidade)}>
                {result.complexidade}
              </Badge>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
