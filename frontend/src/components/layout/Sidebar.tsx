import {
  FilePlus2,
  LayoutDashboard,
  Search,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";

import logo from "@/assets/logo_ufmg.jpg";
import { buttonStyles } from "@/components/ui/buttonStyles";

interface NavigationItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

const navigationItems: NavigationItem[] = [
  {
    label: "Dashboard",
    to: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Novo Processo",
    to: "/novo-processo",
    icon: FilePlus2,
  },
  {
    label: "Resultado",
    to: "/resultado/demo-case",
    icon: Sparkles,
  },
  {
    label: "Consultar Processo",
    to: "/consultar",
    icon: Search,
  },
];

export function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="panel-shell flex w-full shrink-0 flex-col gap-6 p-5 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:w-[292px]">
      <div className="space-y-4">
        <div>
          <img
            src={logo}
            alt="Banco UFMG"
            className="h-10 w-auto object-contain"
          />
        </div>

        <Link
          className={buttonStyles({
            fullWidth: true,
            size: "lg",
            className: "shadow-[0_18px_34px_rgba(15,39,71,0.22)]",
          })}
          to="/novo-processo"
        >
          + Novo Processo
        </Link>
      </div>

      <nav className="space-y-2">
        {navigationItems.map(({ icon: Icon, label, to }) => {
          const isResultRoute =
            label === "Resultado" && pathname.startsWith("/resultado/");

          return (
            <NavLink
              key={label}
              className={({ isActive }) => {
                const active = isActive || isResultRoute;

                return [
                  "group flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium transition",
                  active
                    ? "border-brand-navy/20 bg-brand-navy text-white shadow-[0_16px_28px_rgba(15,39,71,0.16)]"
                    : "border-transparent text-slate-600 hover:border-border-soft hover:bg-mist hover:text-slate-950",
                ].join(" ");
              }}
              end={to === "/"}
              to={to}
            >
              {({ isActive }) => {
                const active = isActive || isResultRoute;

                return (
                  <>
                    <span
                      className={[
                        "flex h-10 w-10 items-center justify-center rounded-2xl transition",
                        active
                          ? "bg-white/16 text-white"
                          : "bg-brand-navy/8 text-brand-navy",
                      ].join(" ")}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>{label}</span>
                  </>
                );
              }}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-auto rounded-3xl border border-brand-gold/25 bg-gradient-to-br from-brand-navy to-brand-navy-deep p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-gold">
          Monitoramento
        </p>
        <p className="mt-3 text-lg font-semibold">
          Auditoria de aderência centralizada
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Acompanhe recomendações aprovadas, divergências por tema e indicadores
          operacionais em um único painel.
        </p>
      </div>
    </aside>
  );
}
