import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { getDashboardAnalytics } from "@/services/api";

type KpiDirection = "up" | "down";

interface DashboardKpi {
  label: string;
  value: string;
  trend: string;
  direction: KpiDirection;
}

interface SavingsItem {
  id: string;
  caseId: string;
  analysisId: string;
  externalCaseNumber: string | null;
  aiRecommendation: string;
  approvalStatus: string;
  feedbackText: string;
  estimatedCauseValueBrl: number | null;
  createdAt: string;
}

interface FeedbackSavings {
  totalFeedbacks: number;
  approvedFeedbacks: number;
  rejectedFeedbacks: number;
  totalSavedCostBrl: number;
  items: SavingsItem[];
}

interface DashboardAnalyticsResponse {
  feedbackSavings?: FeedbackSavings;
}

interface SavingsByMonthDatum {
  month: string;
  total: number;
}

interface DecisionSplitDatum {
  name: string;
  value: number;
  color: string;
}

const emptyFeedbackSavings: FeedbackSavings = {
  totalFeedbacks: 0,
  approvedFeedbacks: 0,
  rejectedFeedbacks: 0,
  totalSavedCostBrl: 0,
  items: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseFeedbackSavings(raw: unknown): FeedbackSavings {
  if (!isRecord(raw) || !isRecord(raw.feedbackSavings)) {
    return emptyFeedbackSavings;
  }

  const feedbackSavings = raw.feedbackSavings;
  const itemsRaw = Array.isArray(feedbackSavings.items)
    ? feedbackSavings.items
    : [];

  const items = itemsRaw
    .map((item): SavingsItem | null => {
      if (!isRecord(item)) {
        return null;
      }

      const id = typeof item.id === "string" ? item.id : "";
      const caseId = typeof item.caseId === "string" ? item.caseId : "";
      const analysisId =
        typeof item.analysisId === "string" ? item.analysisId : "";
      const externalCaseNumber =
        typeof item.externalCaseNumber === "string"
          ? item.externalCaseNumber
          : null;
      const aiRecommendation =
        typeof item.aiRecommendation === "string"
          ? item.aiRecommendation
          : "review";
      const approvalStatus =
        typeof item.approvalStatus === "string"
          ? item.approvalStatus
          : "rejected";
      const feedbackText =
        typeof item.feedbackText === "string" ? item.feedbackText : "";
      const estimatedCauseValueBrl =
        typeof item.estimatedCauseValueBrl === "number"
          ? item.estimatedCauseValueBrl
          : null;
      const createdAt =
        typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString();

      if (!id || !caseId || !analysisId) {
        return null;
      }

      return {
        id,
        caseId,
        analysisId,
        externalCaseNumber,
        aiRecommendation,
        approvalStatus,
        feedbackText,
        estimatedCauseValueBrl,
        createdAt,
      };
    })
    .filter((item): item is SavingsItem => item !== null);

  return {
    totalFeedbacks:
      typeof feedbackSavings.totalFeedbacks === "number"
        ? feedbackSavings.totalFeedbacks
        : items.length,
    approvedFeedbacks:
      typeof feedbackSavings.approvedFeedbacks === "number"
        ? feedbackSavings.approvedFeedbacks
        : items.filter((item) => item.approvalStatus === "approved").length,
    rejectedFeedbacks:
      typeof feedbackSavings.rejectedFeedbacks === "number"
        ? feedbackSavings.rejectedFeedbacks
        : items.filter((item) => item.approvalStatus === "rejected").length,
    totalSavedCostBrl:
      typeof feedbackSavings.totalSavedCostBrl === "number"
        ? feedbackSavings.totalSavedCostBrl
        : items.reduce(
            (sum, item) => sum + (item.estimatedCauseValueBrl ?? 0),
            0,
          ),
    items,
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyCompact(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function formatMonthLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
  })
    .format(new Date(value))
    .replace(".", "")
    .toUpperCase();
}

function formatRecommendation(value: string) {
  if (value === "agreement") {
    return "Acordo";
  }

  if (value === "defense") {
    return "Defesa";
  }

  return "Revisão";
}

function exportFeedbackCsv(rows: SavingsItem[]) {
  const header =
    "PROCESSO ID,RECOMENDACAO IA,STATUS,CUSTO SALVO,FEEDBACK,CRIADO EM\n";
  const body = rows
    .map((row) =>
      [
        row.externalCaseNumber ?? row.caseId,
        formatRecommendation(row.aiRecommendation),
        row.approvalStatus === "approved" ? "APROVADO" : "REPROVADO",
        row.estimatedCauseValueBrl ?? 0,
        `"${row.feedbackText.replaceAll('"', '""')}"`,
        row.createdAt,
      ].join(","),
    )
    .join("\n");

  const blob = new Blob([header + body], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "feedbacks-dashboard.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function useChartWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const updateWidth = () => {
      setWidth(Math.max(0, Math.floor(element.getBoundingClientRect().width)));
    };

    updateWidth();

    const observer = new ResizeObserver(() => {
      updateWidth();
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  return { ref, width };
}

function buildSavingsByMonthData(items: SavingsItem[]): SavingsByMonthDatum[] {
  const buckets = new Map<string, number>();

  for (const item of items) {
    if (item.approvalStatus !== "approved") {
      continue;
    }

    const date = new Date(item.createdAt);

    if (Number.isNaN(date.getTime())) {
      continue;
    }

    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
    buckets.set(
      monthKey,
      (buckets.get(monthKey) ?? 0) + (item.estimatedCauseValueBrl ?? 0),
    );
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, total]) => ({
      month: formatMonthLabel(month),
      total,
    }));
}

function buildDecisionSplitData(
  approvedFeedbacks: number,
  rejectedFeedbacks: number,
): DecisionSplitDatum[] {
  const total = approvedFeedbacks + rejectedFeedbacks;

  if (total === 0) {
    return [
      { name: "Aprovados", value: 0, color: "#0f2044" },
      { name: "Reprovados", value: 0, color: "#d97706" },
    ];
  }

  return [
    {
      name: "Aprovados",
      value: Number(((approvedFeedbacks / total) * 100).toFixed(1)),
      color: "#0f2044",
    },
    {
      name: "Reprovados",
      value: Number(((rejectedFeedbacks / total) * 100).toFixed(1)),
      color: "#d97706",
    },
  ];
}

function buildKpis(feedbackSavings: FeedbackSavings): DashboardKpi[] {
  const totalDecisions =
    feedbackSavings.approvedFeedbacks + feedbackSavings.rejectedFeedbacks;
  const adherenceRate =
    totalDecisions === 0
      ? 0
      : (feedbackSavings.approvedFeedbacks / totalDecisions) * 100;

  return [
    {
      label: "Taxa de Aderência",
      value: formatPercent(adherenceRate),
      trend: `${feedbackSavings.approvedFeedbacks} aprovados e ${feedbackSavings.rejectedFeedbacks} reprovados`,
      direction:
        feedbackSavings.approvedFeedbacks >= feedbackSavings.rejectedFeedbacks
          ? "up"
          : "down",
    },
    {
      label: "Economia Gerada",
      value: formatCurrencyCompact(feedbackSavings.totalSavedCostBrl),
      trend: `${feedbackSavings.approvedFeedbacks} pareceres aprovados com custo salvo`,
      direction: feedbackSavings.totalSavedCostBrl > 0 ? "up" : "down",
    },
  ];
}

export function DashboardPage() {
  // Dashboard page purpose: apresentar métricas reais do backend com base nos feedbacks salvos e nos custos aprovados.
  const navigate = useNavigate();
  const savingsChart = useChartWidth();
  const splitChart = useChartWidth();
  const [feedbackSavings, setFeedbackSavings] = useState(emptyFeedbackSavings);

  useEffect(() => {
    let isActive = true;

    void getDashboardAnalytics().then((response) => {
      if (!isActive || !response) {
        return;
      }

      setFeedbackSavings(parseFeedbackSavings(response as DashboardAnalyticsResponse));
    });

    return () => {
      isActive = false;
    };
  }, []);

  const kpis = useMemo(() => buildKpis(feedbackSavings), [feedbackSavings]);
  const savingsByMonth = useMemo(
    () => buildSavingsByMonthData(feedbackSavings.items),
    [feedbackSavings.items],
  );
  const decisionSplit = useMemo(
    () =>
      buildDecisionSplitData(
        feedbackSavings.approvedFeedbacks,
        feedbackSavings.rejectedFeedbacks,
      ),
    [feedbackSavings.approvedFeedbacks, feedbackSavings.rejectedFeedbacks],
  );

  return (
    <div className="space-y-6">
      <section className="page-card p-6">
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#1a1a2e]">
              Dashboard
            </h1>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              Acompanhe as métricas gerais dos seus processos.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {kpis.map((item) => {
          const positive = item.direction === "up";

          return (
            <div key={item.label} className="page-card p-5">
              <p className="text-sm font-medium text-slate-500">{item.label}</p>
              <p className="mt-4 text-3xl font-bold tracking-tight text-[#1a1a2e]">
                {item.value}
              </p>
              <div
                className={[
                  "mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
                  positive
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-red-50 text-red-600",
                ].join(" ")}
              >
                {positive ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : (
                  <ArrowDownRight className="h-4 w-4" />
                )}
                {item.trend}
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="page-card p-6">
          <div>
            <h2 className="text-lg font-semibold text-[#1a1a2e]">
              Custos Salvos por Mês
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Soma dos custos salvos a partir dos pareceres aprovados.
            </p>
          </div>

          <div ref={savingsChart.ref} className="mt-6 h-80 min-w-0">
            {savingsChart.width > 0 && savingsByMonth.length > 0 ? (
              <BarChart
                barGap={8}
                data={savingsByMonth}
                height={320}
                width={savingsChart.width}
              >
                <XAxis
                  axisLine={false}
                  dataKey="month"
                  tickLine={false}
                  tick={{ fill: "#6b7280", fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickFormatter={(value: number) => formatCurrencyCompact(value)}
                  tickLine={false}
                  tick={{ fill: "#6b7280", fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value) => [
                    formatCurrency(typeof value === "number" ? value : Number(value)),
                    "Custo salvo",
                  ]}
                  labelStyle={{ color: "#1a1a2e", fontWeight: 600 }}
                />
                <Bar
                  dataKey="total"
                  fill="#0f2044"
                  name="Custo salvo"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            ) : (
              <div className="flex h-full items-center justify-center rounded-[8px] border border-dashed border-border-soft bg-[#fafbfd] px-6 text-center text-sm text-slate-500">
                Nenhum custo salvo foi registrado até o momento.
              </div>
            )}
          </div>
        </div>

        <div className="page-card p-6">
          <div>
            <h2 className="text-lg font-semibold text-[#1a1a2e]">
              Aprovação dos Pareceres
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Distribuição entre feedbacks aprovados e reprovados.
            </p>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.95fr] lg:items-center">
            <div ref={splitChart.ref} className="relative h-72 min-w-0">
              {splitChart.width > 0 ? (
                <PieChart height={288} width={splitChart.width}>
                  <Pie
                    cx="50%"
                    cy="50%"
                    data={decisionSplit}
                    dataKey="value"
                    innerRadius={72}
                    outerRadius={112}
                    paddingAngle={4}
                    stroke="none"
                  >
                    {decisionSplit.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [`${value}%`, "Participação"]}
                  />
                </PieChart>
              ) : null}

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-[#1a1a2e]">
                  {feedbackSavings.totalFeedbacks}
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  FEEDBACKS
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {decisionSplit.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between rounded-[8px] border border-border-soft bg-[#fbfcfe] px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm text-slate-700">{item.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-[#1a1a2e]">
                    {formatPercent(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="page-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#1a1a2e]">
              Feedbacks Registrados
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Pareceres aprovados e reprovados já persistidos no backend.
            </p>
          </div>

          <Button
            onClick={() => exportFeedbackCsv(feedbackSavings.items)}
            variant="secondary"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>

        <div className="mt-6 overflow-hidden rounded-[8px] border border-border-soft">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border-soft text-left">
              <thead className="bg-[#f8fafc]">
                <tr className="text-xs uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-4 py-3 font-semibold">PROCESSO ID</th>
                  <th className="px-4 py-3 font-semibold">RECOMENDAÇÃO IA</th>
                  <th className="px-4 py-3 font-semibold">STATUS</th>
                  <th className="px-4 py-3 font-semibold">CUSTO SALVO</th>
                  <th className="px-4 py-3 font-semibold">FEEDBACK</th>
                  <th className="px-4 py-3 font-semibold">AÇÃO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft bg-white">
                {feedbackSavings.items.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-10 text-center text-sm text-slate-500"
                      colSpan={6}
                    >
                      Nenhum feedback foi salvo no backend ainda.
                    </td>
                  </tr>
                ) : null}

                {feedbackSavings.items.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-4 text-sm font-medium text-[#1a1a2e]">
                      {row.externalCaseNumber ?? row.caseId}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">
                      {formatRecommendation(row.aiRecommendation)}
                    </td>
                    <td className="px-4 py-4">
                      <Badge
                        tone={
                          row.approvalStatus === "approved"
                            ? "success"
                            : "warning"
                        }
                      >
                        {row.approvalStatus === "approved"
                          ? "APROVADO"
                          : "REPROVADO"}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600">
                      {row.estimatedCauseValueBrl
                        ? formatCurrency(row.estimatedCauseValueBrl)
                        : "—"}
                    </td>
                    <td className="max-w-xl px-4 py-4 text-sm text-slate-600">
                      <span className="line-clamp-2">{row.feedbackText}</span>
                    </td>
                    <td className="px-4 py-4">
                      <Button
                        onClick={() => navigate(`/resultado/${row.caseId}`)}
                        size="sm"
                        variant="secondary"
                      >
                        Ver
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
