import { useCallback } from "react";
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
}

export function ConfigPanel({ settings, onChange, disabled }: ConfigPanelProps) {
  const update = useCallback(
    (key: keyof DetectionSettings, value: number) => {
      onChange({ ...settings, [key]: value });
    },
    [settings, onChange]
  );

  return (
    <div className="p-3 space-y-3 border-b border-zinc-800">
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <Settings size={12} />
        <span className="font-medium">Detection Config</span>
      </div>

      <div className="space-y-2">
        <label className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">Min Silence (ms)</span>
          <input
            type="number"
            min={100}
            max={5000}
            step={100}
            value={settings.minSilenceDurationMs}
            onChange={(e) => update("minSilenceDurationMs", Number(e.target.value))}
            disabled={disabled}
            className="w-20 px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs text-right disabled:opacity-50"
          />
        </label>

        <label className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">Speech Pad (ms)</span>
          <input
            type="number"
            min={0}
            max={1000}
            step={50}
            value={settings.speechPadMs}
            onChange={(e) => update("speechPadMs", Number(e.target.value))}
            disabled={disabled}
            className="w-20 px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs text-right disabled:opacity-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <div className="flex justify-between">
            <span className="text-zinc-500">Silence Threshold</span>
            <span className="text-zinc-400">{(settings.threshold * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={settings.threshold * 100}
            onChange={(e) => update("threshold", Number(e.target.value) / 100)}
            disabled={disabled}
            className="w-full h-1 rounded-full appearance-none bg-zinc-700 accent-accent"
          />
        </label>
      </div>
    </div>
  );
}
