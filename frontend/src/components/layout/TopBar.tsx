import { Bell, Search } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function TopBar() {
  return (
    <header className="panel-shell sticky top-4 z-10 flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="relative w-full max-w-xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          aria-label="Pesquisar processo"
          className="pl-11"
          placeholder="Pesquisar por número do processo, parte ou etiqueta"
        />
      </div>

      <div className="flex items-center justify-between gap-3 lg:justify-end">
        <Button aria-label="Notificações" size="sm" variant="secondary">
          <Bell className="h-4 w-4" />
          Alertas
        </Button>

        <div className="flex items-center gap-3 rounded-2xl border border-border-soft bg-white px-3 py-2 shadow-[0_12px_24px_rgba(15,39,71,0.05)]">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-navy to-slate-700 text-sm font-semibold text-white">
            BU
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              Equipe Jurídica
            </p>
            <p className="truncate text-xs text-slate-500">
              Banco UFMG
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
