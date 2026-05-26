import { useState, useEffect, useCallback } from "react";
import { X, Key, Check } from "lucide-react";
import { showToast } from "./Toast";

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("http://127.0.0.1:18420/settings")
      .then((r) => r.json())
      .then((d) => { if (d.groq_api_key && d.groq_api_key !== "") setHasKey(true); })
      .catch(() => {});
  }, []);

  const handleSave = useCallback(async () => {
    if (!apiKey.trim() || apiKey.includes("...")) return;
    try {
      await fetch("http://127.0.0.1:18420/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "groq_api_key", value: apiKey.trim() }),
      });
      setSaved(true);
      showToast("API key saved", "success");
      setTimeout(onClose, 800);
    } catch {
      showToast("Failed to save", "error");
    }
  }, [apiKey, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-[#1a1a1a] border border-zinc-800 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-200">Settings</h3>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-300"><X size={14} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs text-zinc-400">
              <Key size={11} /> Groq API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setSaved(false); }}
              placeholder={hasKey ? "Key saved ✓ (paste new to replace)" : "gsk_..."}
              className="w-full px-3 py-2 rounded-lg text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-accent/50"
            />
            <p className="text-[9px] text-zinc-600">Free at console.groq.com/keys — enables auto-caption feature.</p>
          </div>
          <button
            onClick={handleSave}
            disabled={!apiKey.trim()}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-40 transition-colors"
          >
            {saved ? <><Check size={12} /> Saved</> : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
