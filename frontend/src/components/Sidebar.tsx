import { Upload, ScanLine, Download } from "lucide-react";
import { cn } from "../lib/utils";

type Page = "import" | "review" | "export";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const navItems: { page: Page; icon: typeof Upload; label: string }[] = [
  { page: "import", icon: Upload, label: "Import" },
  { page: "review", icon: ScanLine, label: "Review" },
  { page: "export", icon: Download, label: "Export" },
];

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <nav className="w-14 h-full bg-[#0a0a0a] border-r border-zinc-800 flex flex-col items-center pt-3 gap-1">
      {navItems.map(({ page, icon: Icon, label }) => (
        <button
          key={page}
          onClick={() => onNavigate(page)}
          title={label}
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
            currentPage === page
              ? "bg-zinc-800 text-white"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
          )}
        >
          <Icon size={18} />
        </button>
      ))}
    </nav>
  );
}
