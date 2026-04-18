import { FileSearch, Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { searchCase } from "@/services/api";
import type { CaseMetadata } from "@/types/case";

function formatProcessNumber(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 20);
  const masks = [7, 2, 4, 1, 2, 4];
  const separators = ["-", ".", ".", ".", "."];

  let result = "";
  let cursor = 0;

  masks.forEach((length, index) => {
    if (cursor >= digits.length) {
      return;
    }

    const part = digits.slice(cursor, cursor + length);
    result += part;
    cursor += length;

    if (part.length === length && cursor < digits.length) {
      result += separators[index];
    }
  });

  return result;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(value));
}

function verdictTone(recommendation: CaseMetadata["verdictRecommendation"]) {
  return recommendation === "Acordo" ? "success" : "warning";
}

export function ConsultarProcessoPage() {
  // Consultar Processo page purpose: localizar um processo pelo número CNJ e abrir a análise previamente gerada.
  const navigate = useNavigate();

  const [processNumber, setProcessNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CaseMetadata | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    if (!processNumber.trim()) {
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      const response = await searchCase(processNumber);
      setResult(response);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-4xl flex-col items-center justify-center">
      <div className="w-full rounded-[8px] border border-border-soft bg-white p-8 shadow-[0_12px_32px_rgba(15,32,68,0.08)]">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-[#1a1a2e]">
            Consultar Processo
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Busque pelo número do processo para acessar a análise gerada pelo
            Agente IA.
          </p>
        </div>

        <div className="mx-auto mt-8 flex w-full max-w-2xl flex-col gap-3 sm:flex-row">
          <Input
            className="sm:flex-1"
            onChange={(event) =>
              setProcessNumber(formatProcessNumber(event.target.value))
            }
            placeholder="0000000-00.0000.0.00.0000"
            value={processNumber}
          />
          <Button
            className="sm:min-w-36"
            disabled={!processNumber.trim()}
            onClick={handleSearch}
          >
            <Search className="h-4 w-4" />
            Buscar
          </Button>
        </div>

        <div className="mt-10 min-h-52">
          {loading ? (
            <div className="flex h-52 items-center justify-center">
              <div className="inline-flex items-center gap-3 rounded-full border border-border-soft bg-white px-5 py-3 text-sm text-slate-600">
                <Spinner className="text-brand-navy" />
                Consultando análise cadastrada...
              </div>
            </div>
          ) : null}

          {!loading && result ? (
            <div className="rounded-[8px] border border-border-soft bg-[#fbfcfe] p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm text-slate-500">{result.processNumber}</p>
                  <h2 className="mt-2 text-2xl font-semibold text-[#1a1a2e]">
                    {result.clientName}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">{result.vara}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Data do fato: {formatDate(result.dataFato)}
                  </p>
                </div>

                <Badge tone={verdictTone(result.verdictRecommendation)}>
                  {result.verdictRecommendation}
                </Badge>
              </div>

              <Button
                className="mt-6"
                onClick={() => navigate(`/resultado/${result.caseId}`)}
              >
                Ver Análise Completa
              </Button>
            </div>
          ) : null}

          {!loading && searched && !result ? (
            <div className="flex h-52 flex-col items-center justify-center rounded-[8px] border border-dashed border-border-soft bg-[#fafbfd] px-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-mist text-brand-navy">
                <FileSearch className="h-8 w-8" />
              </div>
              <p className="mt-5 text-lg font-semibold text-[#1a1a2e]">
                Nenhum processo encontrado para este número.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
