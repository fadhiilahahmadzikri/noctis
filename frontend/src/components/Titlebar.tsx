import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { useAppStore } from "../stores/appStore";

export function Titlebar() {
  const appWindow = getCurrentWindow();
  const sidecarReady = useAppStore((s) => s.sidecarReady);

  return (
    <header className="h-8 flex items-center justify-between bg-[#0a0a0a] border-b border-zinc-800 select-none fixed top-0 left-0 right-0 z-50">
      <div
        className="flex-1 h-full flex items-center pl-3 gap-2"
        data-tauri-drag-region
      >
        <span className="text-xs font-medium text-zinc-400 pointer-events-none">
          Lethe
        </span>
        <div
          className={`w-1.5 h-1.5 rounded-full pointer-events-none ${
            sidecarReady ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
          }`}
        />
      </div>
      <div className="flex h-full">
        <button
          onClick={() => appWindow.minimize()}
          className="w-11 h-full flex items-center justify-center text-zinc-400 hover:bg-zinc-800 transition-colors"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          className="w-11 h-full flex items-center justify-center text-zinc-400 hover:bg-zinc-800 transition-colors"
        >
          <Square size={12} />
        </button>
        <button
          onClick={() => appWindow.close()}
          className="w-11 h-full flex items-center justify-center text-zinc-400 hover:bg-red-600 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
