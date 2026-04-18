import { FileText, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/Badge";

interface FileCardProps {
  fileName: string;
  fileSize: string;
  status: string;
}

export function FileCard({ fileName, fileSize, status }: FileCardProps) {
  return (
    <div className="flex items-center justify-between rounded-3xl border border-border-soft bg-white px-4 py-3 shadow-[0_14px_32px_rgba(15,39,71,0.06)]">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-navy/8 text-brand-navy">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{fileName}</p>
          <p className="text-xs text-slate-500">{fileSize}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge tone="info">{status}</Badge>
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
      </div>
    </div>
  );
}
