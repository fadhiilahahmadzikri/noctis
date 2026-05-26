import { useCallback, useRef, useState } from "react";
import { Settings } from "lucide-react";

export interface DetectionSettings {
  threshold: number;
  minSilenceDurationMs: number;
  speechPadMs: number;
}

interface ConfigPanelProps {
  settings: DetectionSettings;
  onChange: (settings: DetectionSettings) => void;
  disabled?: boolean;
  duration: number;
  outputDuration: number;
}

export function ConfigPanel({ settings, onChange, disabled, duration, outputDuration }: ConfigPanelProps) {
  const update = useCallback(
    (key: keyof DetectionSettings, value: number) => {
      onChange({ ...settings, [key]: value });
    },
    [settings, onChange]
  );

  const saved = duration - outputDuration;

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
        <Settings size={10} />
        <span>Detection</span>
      </div>

      <div className="space-y-2.5">
        <DragInput label="Min Silence" unit="ms" value={settings.minSilenceDurationMs} min={100} max={5000} step={50} onChange={(v) => update("minSilenceDurationMs", v)} disabled={disabled} />
        <DragInput label="Speech Pad" unit="ms" value={settings.speechPadMs} min={0} max={1000} step={25} onChange={(v) => update("speechPadMs", v)} disabled={disabled} />
        <DragInput label="Threshold" unit="%" value={Math.round(settings.threshold * 100)} min={0} max={100} step={5} onChange={(v) => update("threshold", v / 100)} disabled={disabled} />
      </div>

      {/* Human-readable output summary */}
      {duration > 0 && (
        <div className="pt-2 border-t border-zinc-800/50 space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-zinc-600">Original</span>
            <span className="text-zinc-400">{fmtDuration(duration)}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-zinc-600">Output</span>
            <span className="text-emerald-400 font-medium">{fmtDuration(outputDuration)}</span>
          </div>
          {saved > 0 && (
            <div className="flex justify-between text-[10px]">
              <span className="text-zinc-600">Saved</span>
              <span className="text-accent">{fmtDuration(saved)} ({Math.round((saved / duration) * 100)}%)</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Figma-style drag input: click and drag horizontally to change value */
function DragInput({ label, unit, value, min, max, step, onChange, disabled }: {
  label: string; unit: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, val: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    startRef.current = { x: e.clientX, val: value };
    setDragging(true);

    const handleMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startRef.current.x;
      const delta = Math.round(dx / 2) * step;
      const newVal = Math.max(min, Math.min(max, startRef.current.val + delta));
      onChange(newVal);
    };
    const handleUp = () => {
      setDragging(false);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }, [value, min, max, step, onChange, disabled]);

  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-zinc-500">{label}</span>
      <div
        onMouseDown={handleMouseDown}
        className={`px-2 py-0.5 rounded text-[11px] font-mono tabular-nums select-none transition-colors ${
          dragging ? "bg-accent/20 text-accent cursor-ew-resize" : "bg-zinc-800/80 text-zinc-300 cursor-ew-resize hover:bg-zinc-700/80"
        } ${disabled ? "opacity-40 pointer-events-none" : ""}`}
      >
        {value}{unit}
      </div>
    </div>
  );
}

function fmtDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
