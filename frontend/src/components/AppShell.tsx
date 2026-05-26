import type { ReactNode } from "react";
import { Titlebar } from "./Titlebar";
import { Sidebar } from "./Sidebar";

type Page = "import" | "review" | "export";

interface AppShellProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  children: ReactNode;
}

export function AppShell({ currentPage, onNavigate, children }: AppShellProps) {
  return (
    <div className="h-screen w-screen overflow-hidden">
      <Titlebar />
      <div className="flex h-full pt-8">
        <Sidebar currentPage={currentPage} onNavigate={onNavigate} />
        <main className="flex-1 bg-[#111111] overflow-auto">{children}</main>
      </div>
    </div>
  );
}
