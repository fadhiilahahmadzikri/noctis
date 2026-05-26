import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Undo2, Redo2, Settings } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../stores/appStore";
import { useProjectStore } from "../stores/projectStore";
import { useHistoryStore } from "../stores/historyStore";
import { SettingsModal } from "./SettingsModal";

export function Titlebar() {
  const appWindow = getCurrentWindow();
  const sidecarReady = useAppStore((s) => s.sidecarReady);
  const videoPath = useProjectStore((s) => s.videoPath);
  const setSegments = useProjectStore((s) => s.setSegments);
  const { undo, redo, canUndo, canRedo } = useHistoryStore();
  const [showSettings, setShowSettings] = useState(false);

  const projectName = videoPath ? videoPath.split(/[/\\]/).pop() : "Noctis";

  return (
    <header className="h-9 flex items-center bg-[#1a1a1a] border-b border-zinc-800/50 select-none shrink-0">
      {/* Left: drag + logo */}
      <div className="flex items-center gap-2 px-3 h-full" data-tauri-drag-region>
        <img src="/logo.png" alt="Noctis" className="w-4 h-4 rounded-sm pointer-events-none" />
        <span className="text-[11px] font-semibold text-zinc-300 pointer-events-none">{projectName}</span>
        <div className={`w-1.5 h-1.5 rounded-full ${sidecarReady ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`} />
      </div>

      {/* Center: undo/redo */}
      <div className="flex-1 flex items-center justify-center gap-1" data-tauri-drag-region>
        <button
          onClick={() => { const p = undo(); if (p) setSegments(p); }}
          disabled={!canUndo()}
          className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 disabled:opacity-20 transition-colors"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={13} />
        </button>
        <button
          onClick={() => { const n = redo(); if (n) setSegments(n); }}
          disabled={!canRedo()}
          className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 disabled:opacity-20 transition-colors"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 size={13} />
        </button>
      </div>

      {/* Right: settings + window controls */}
      <div className="flex h-full">
        <button onClick={() => setShowSettings(true)} className="w-10 h-full flex items-center justify-center text-zinc-500 hover:bg-zinc-700/50 transition-colors" title="Settings">
          <Settings size={13} />
        </button>
        <button onClick={() => appWindow.minimize()} className="w-10 h-full flex items-center justify-center text-zinc-500 hover:bg-zinc-700/50 transition-colors">
          <Minus size={13} />
        </button>
        <button onClick={() => appWindow.toggleMaximize()} className="w-10 h-full flex items-center justify-center text-zinc-500 hover:bg-zinc-700/50 transition-colors">
          <Square size={11} />
        </button>
        <button onClick={() => appWindow.close()} className="w-10 h-full flex items-center justify-center text-zinc-500 hover:bg-red-600 hover:text-white transition-colors">
          <X size={13} />
        </button>
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </header>
  );
}
