import { ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/Badge";

type KpiTone = "success" | "warning" | "info";

interface KpiCardProps {
  label: string;
  value: string;
  change: string;
  tone?: KpiTone;
}

export function KpiCard({
  label,
  value,
  change,
  tone = "info",
}: KpiCardProps) {
  return (
    <div className="panel-shell p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {value}
          </p>
        </div>
        <div className="rounded-2xl bg-brand-navy/6 p-2 text-brand-navy">
          <ArrowUpRight className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-4">
        <Badge tone={tone}>{change}</Badge>
      </div>
    </div>
  );
}
