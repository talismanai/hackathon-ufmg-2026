import {
  Bot,
  CheckCircle2,
  FileText,
  UploadCloud,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { submitCase, waitForCaseAnalysis } from "@/services/api";

interface UploadQueueItem {
  id: string;
  file: File;
  progress: number;
  status: "processing" | "completed";
}

function generateProtocolId() {
  const year = new Date().getFullYear();
  const digits = Math.floor(Math.random() * 9000) + 1000;
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `#PTC-${year}-${digits}-${letter}`;
}

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

function formatBytes(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  const amount = Number(digits) / 100;

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

function parseCurrencyToCents(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "404") {
      return "Não foi possível enviar o caso. O endpoint não foi encontrado.";
    }

    if (error.message === "500") {
      return "O backend retornou um erro interno ao processar a solicitação.";
    }

    return error.message;
  }

  return "Não foi possível enviar o caso para análise.";
}

export function NovoProcessoPage() {
  // Novo Processo page purpose: capturar documentos PDF, simular triagem inicial e enviar o caso para análise automatizada.
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timersRef = useRef<Map<string, number>>(new Map());
  const dragDepthRef = useRef(0);

  const [protocolId] = useState(generateProtocolId);
  const [processNumber, setProcessNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [claimAmount, setClaimAmount] = useState("");
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");

  useEffect(() => {
    const timers = timersRef.current;

    return () => {
      timers.forEach((timerId) => {
        window.clearInterval(timerId);
      });
      timers.clear();
    };
  }, []);

  const claimAmountCents = parseCurrencyToCents(claimAmount);
  const canSubmit =
    queue.length > 0 &&
    processNumber.trim().length > 0 &&
    claimAmountCents > 0;

  const queueCountLabel = useMemo(() => queue.length, [queue.length]);

  function startFakeProgress(itemId: string) {
    const startedAt = Date.now();
    const timerId = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(100, Math.round((elapsed / 3000) * 100));

      setQueue((current) =>
        current.map((entry) =>
          entry.id === itemId
            ? {
                ...entry,
                progress,
                status: progress >= 100 ? "completed" : "processing",
              }
            : entry,
        ),
      );

      if (progress >= 100) {
        window.clearInterval(timerId);
        timersRef.current.delete(itemId);
      }
    }, 120);

    timersRef.current.set(itemId, timerId);
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) {
      return;
    }

    const validFiles = Array.from(fileList).filter(
      (file) =>
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf"),
    );

    const newItems = validFiles.map((file) => ({
      id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
      file,
      progress: 0,
      status: "processing" as const,
    }));

    if (newItems.length === 0) {
      return;
    }

    setQueue((current) => [...current, ...newItems]);
    newItems.forEach((item) => startFakeProgress(item.id));
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    addFiles(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }

  function removeFile(itemId: string) {
    const timerId = timersRef.current.get(itemId);
    if (timerId) {
      window.clearInterval(timerId);
      timersRef.current.delete(itemId);
    }

    setQueue((current) => current.filter((item) => item.id !== itemId));
  }

  async function handleSubmit() {
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setSubmissionError("");

    try {
      const response = await submitCase({
        processNumber,
        clientName,
        claimAmountCents,
        files: queue.map((item) => item.file),
      });

      await waitForCaseAnalysis(response.caseId);
      navigate(`/resultado/${response.caseId}`);
    } catch (error) {
      setSubmissionError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-6">
        <div className="page-card p-6 lg:p-8">
          <Badge tone="info" className="border-transparent bg-mist text-brand-navy">
            PROTOCOLO
          </Badge>
          <p className="mt-4 text-sm font-semibold tracking-[0.12em] text-brand-navy">
            {protocolId}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#1a1a2e]">
            Novo Protocolo de Análise
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
            Envio e Triagem de documentos para análise automatizada pelo Agente
            IA.
          </p>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Número do Processo
              </span>
              <Input
                onChange={(event) =>
                  setProcessNumber(formatProcessNumber(event.target.value))
                }
                placeholder="0000000-00.0000.0.00.0000"
                value={processNumber}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Nome do Cliente
              </span>
              <Input
                onChange={(event) => setClientName(event.target.value)}
                placeholder="Nome completo da parte autora"
                value={clientName}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700">
                Valor do Processo
              </span>
              <Input
                inputMode="numeric"
                onChange={(event) =>
                  setClaimAmount(formatCurrencyInput(event.target.value))
                }
                placeholder="R$ 0,00"
                value={claimAmount}
              />
            </label>
          </div>
        </div>

        <div className="page-card p-6">
          <input
            ref={inputRef}
            accept="application/pdf,.pdf"
            className="hidden"
            multiple
            onChange={handleInputChange}
            type="file"
          />

          <div
            className={[
              "flex min-h-[260px] flex-col items-center justify-center rounded-[8px] border-2 border-dashed px-6 py-10 text-center transition",
              isDragging
                ? "border-brand-navy bg-mist"
                : "border-[#cfd8e6] bg-[#fafbfd]",
            ].join(" ")}
            onClick={() => inputRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            <div className="pointer-events-none flex h-16 w-16 items-center justify-center rounded-full bg-mist text-brand-navy">
              <UploadCloud className="h-8 w-8" />
            </div>
            <p className="pointer-events-none mt-5 text-lg font-semibold text-[#1a1a2e]">
              Arraste os arquivos PDF aqui
            </p>
            <p className="pointer-events-none mt-2 max-w-xl text-sm leading-6 text-slate-500">
              ou clique para selecionar os arquivos do seu computador. Apenas
              formatos PDF são suportados.
            </p>
            <Button
              className="pointer-events-none mt-6"
              onClick={(event) => {
                event.stopPropagation();
                inputRef.current?.click();
              }}
              variant="secondary"
            >
              Selecionar Arquivos
            </Button>
          </div>

          {queue.length > 0 ? (
            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">
                  ARQUIVOS EM PROCESSAMENTO ({queueCountLabel})
                </p>
                <span className="text-xs text-slate-500">
                  Triagem simulada em tempo real
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {queue.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[8px] border border-border-soft bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-[8px] bg-mist text-brand-navy">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#1a1a2e]">
                            {item.file.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatBytes(item.file.size)}
                          </p>
                        </div>
                      </div>

                      <button
                        className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        onClick={() => removeFile(item.id)}
                        type="button"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-brand-navy transition-all duration-150"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-slate-500">
                          {item.status === "processing" ? (
                            <>
                              <Spinner className="h-3.5 w-3.5 text-brand-navy" />
                              Processando leitura...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              Leitura concluída
                            </>
                          )}
                        </span>
                        <span className="font-medium text-slate-600">
                          {item.progress}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <Button
            className="mt-8"
            disabled={!canSubmit}
            fullWidth
            isLoading={isSubmitting}
            onClick={handleSubmit}
            size="lg"
          >
            <Bot className="h-4 w-4" />
            {isSubmitting
              ? "Aguardando análise do backend..."
              : "Enviar para Análise do Agente IA"}
          </Button>

          {submissionError ? (
            <p className="mt-3 rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {submissionError}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
