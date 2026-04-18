export function TopBar() {
  return (
    <header className="panel-shell sticky top-4 z-10 flex justify-end px-5 py-4">
      <div className="flex items-center justify-end gap-3">
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
