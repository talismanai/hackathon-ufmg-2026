import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { Layout } from "@/components/layout/Layout";

const DashboardPage = lazy(() =>
  import("@/pages/Dashboard/index").then((module) => ({
    default: module.DashboardPage,
  })),
);
const NovoProcessoPage = lazy(() =>
  import("@/pages/NovoProcesso/index").then((module) => ({
    default: module.NovoProcessoPage,
  })),
);
const ResultadoPage = lazy(() =>
  import("@/pages/Resultado/index").then((module) => ({
    default: module.ResultadoPage,
  })),
);
const ConsultarProcessoPage = lazy(() =>
  import("@/pages/ConsultarProcesso/index").then((module) => ({
    default: module.ConsultarProcessoPage,
  })),
);

function RouteFallback() {
  return (
    <div className="page-card flex min-h-[220px] items-center justify-center p-8">
      <div className="text-sm font-medium text-slate-500">
        Carregando módulo...
      </div>
    </div>
  );
}

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        index: true,
        element: withSuspense(<DashboardPage />),
      },
      {
        path: "dashboard",
        element: withSuspense(<DashboardPage />),
      },
      {
        path: "novo-processo",
        element: withSuspense(<NovoProcessoPage />),
      },
      {
        path: "resultado/:caseId",
        element: withSuspense(<ResultadoPage />),
      },
      {
        path: "consultar",
        element: withSuspense(<ConsultarProcessoPage />),
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider future={{ v7_startTransition: true }} router={router} />;
}
