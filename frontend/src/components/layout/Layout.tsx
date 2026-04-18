import { Outlet } from "react-router-dom";

import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

interface LayoutProps {
  showTopBar?: boolean;
}

export function Layout({ showTopBar = true }: LayoutProps) {
  return (
    <div className="min-h-screen px-4 py-4 lg:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 lg:flex-row">
        <Sidebar />

        <main className="flex min-w-0 flex-1 flex-col gap-4">
          {showTopBar ? <TopBar /> : null}
          <div className="flex-1 rounded-[2rem] border border-white/55 bg-white/35 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
