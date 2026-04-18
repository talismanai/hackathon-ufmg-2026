import {
  CheckCircle2,
  ChevronRight,
  Cpu,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { getCaseResult } from "@/services/api";
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

export function ResultadoPage() {
  // Resultado page purpose: exibir o parecer do Agente IA, permitir aprovação ou divergência por tópico e consolidar o parecer jurídico.
  const { caseId = "case-2418A" } = useParams();

  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<CaseResult | null>(null);
  const [topicDecisions, setTopicDecisions] = useState<TopicDecisions>({});
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    let mounted = true;
    let apiReady = false;
    let timerReady = false;

    setProcessing(true);
    setProgress(0);

    const timerId = window.setInterval(() => {
      setProgress((current) => {
        const next = Math.min(100, current + 4);
        if (next >= 100) {
          window.clearInterval(timerId);
          timerReady = true;
          if (apiReady && mounted) {
            setProcessing(false);
          }
        }
        return next;
      });
    }, 120);

    void getCaseResult(caseId)
      .then((response) => {
        if (!mounted) {
          return;
        }

        setResult(response);
        apiReady = true;

        if (timerReady) {
          setProcessing(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setProcessing(false);
        }
      });

    return () => {
      mounted = false;
      window.clearInterval(timerId);
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

  if (processing || !result) {
    const estimatedSeconds = Math.max(0, Math.ceil(((100 - progress) / 100) * 3));

    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="page-card w-full max-w-3xl p-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-mist text-brand-navy">
            <Cpu className="h-10 w-10" />
          </div>
          <h1 className="mt-6 text-3xl font-bold text-[#1a1a2e]">
            Processando Documento pelo Agente IA
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            A inteligência artificial está analisando os documentos e extraindo
            os principais argumentos.
          </p>

          <div className="mt-8">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-brand-navy transition-all duration-100"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
              <span>{progress}% Concluído</span>
              <span>Est. {estimatedSeconds}s</span>
            </div>
          </div>

          <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-border-soft bg-white px-4 py-2 text-sm text-slate-600">
            <Spinner className="text-brand-navy" />
            Validando tópicos operacionais e precedentes internos
          </div>
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

            <Badge tone="warning" className="h-fit self-start">
              AGUARDANDO PARECER
            </Badge>
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
                      ].join(" ")}
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
                          ? "border-red-200 bg-red-50 text-red-600"
                          : "border-border-soft bg-white text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-600",
                      ].join(" ")}
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

          <Button
            className="mt-6"
            disabled={!allTopicsDecided}
            size="lg"
            variant="primary"
          >
            <CheckCircle2 className="h-4 w-4" />
            Confirmar Parecer
          </Button>
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
            Recomendação: {result.verdict.recommendation}
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-700">
            Probabilidade de êxito da parte autora de{" "}
            <strong>{Math.round(result.verdict.probability * 100)}%</strong>,
            baseada em {result.verdict.similarCases} casos similares
            avaliados pela base histórica.
          </p>

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
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-500">
                Advogado Responsável
              </span>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-navy text-sm font-semibold text-white">
                  {result.advogado.initials}
                </div>
                <span className="text-sm font-medium text-[#1a1a2e]">
                  {result.advogado.name}
                </span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
