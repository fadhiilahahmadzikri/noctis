import { useState, useCallback } from "react";
import { MessageSquareText, Download, Loader2, Key } from "lucide-react";

interface TranscriptChunk {
  text: string;
  start_ms: number;
  end_ms: number;
}

interface CaptionPanelProps {
  projectId: string;
  currentTime: number;
  onSeek: (ms: number) => void;
}

export function CaptionPanel({ projectId, currentTime, onSeek }: CaptionPanelProps) {
  const [token, setToken] = useState(() => localStorage.getItem("hf_token") || "");
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTranscribe = useCallback(async () => {
    if (!token.trim()) { setError("Enter HuggingFace token"); return; }
    localStorage.setItem("hf_token", token);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`http://localhost:18420/project/${projectId}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hf_token: token }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Transcription failed");
      }
      const data = await res.json();
      setChunks(data.chunks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [projectId, token]);

  const exportSRT = useCallback(() => {
    if (chunks.length === 0) return;
    let srt = "";
    chunks.forEach((c, i) => {
      srt += `${i + 1}\n${toSrt(c.start_ms)} --> ${toSrt(c.end_ms)}\n${c.text}\n\n`;
    });
    const blob = new Blob([srt], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "captions.srt";
    a.click();
  }, [chunks]);

  const activeChunk = chunks.find((c) => currentTime >= c.start_ms && currentTime <= c.end_ms);

  return (
    <div className="h-full flex flex-col bg-[#141414]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-zinc-800/50 flex items-center gap-1.5">
        <MessageSquareText size={11} className="text-zinc-500" />
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Caption</span>
      </div>

      {/* Token input */}
      {chunks.length === 0 && (
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Key size={10} className="text-zinc-600" />
            <span className="text-[9px] text-zinc-600">HuggingFace Token</span>
          </div>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="hf_..."
            className="w-full px-2 py-1.5 rounded text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-accent/50"
          />
          <button
            onClick={handleTranscribe}
            disabled={loading || !token.trim()}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] rounded bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 disabled:opacity-40 transition-colors"
          >
            {loading ? <Loader2 size={10} className="animate-spin" /> : <MessageSquareText size={10} />}
            {loading ? "Transcribing..." : "Generate Captions"}
          </button>
          <p className="text-[8px] text-zinc-700 leading-tight">
            Free at huggingface.co/settings/tokens. Uses Whisper large-v3-turbo (their GPU, not yours).
          </p>
        </div>
      )}

      {/* Transcript chunks */}
      {chunks.length > 0 && (
        <>
          <div className="flex-1 overflow-y-auto scrollbar-none p-2 space-y-0.5">
            {chunks.map((chunk, i) => {
              const isActive = currentTime >= chunk.start_ms && currentTime <= chunk.end_ms;
              return (
                <div
                  key={i}
                  onClick={() => onSeek(chunk.start_ms)}
                  className={`px-2 py-1 rounded cursor-pointer transition-colors text-[10px] ${
                    isActive ? "bg-accent/10 text-white" : "text-zinc-400 hover:bg-zinc-800/50"
                  }`}
                >
                  <span className="text-[8px] text-zinc-600 font-mono">{fmtMs(chunk.start_ms)}</span>
                  <span className="ml-1.5">{chunk.text}</span>
                </div>
              );
            })}
          </div>
          <div className="p-2 border-t border-zinc-800/50 flex gap-1">
            <button onClick={exportSRT} className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[9px] rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700">
              <Download size={9} /> SRT
            </button>
            <button onClick={handleTranscribe} disabled={loading} className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[9px] rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-40">
              {loading ? <Loader2 size={9} className="animate-spin" /> : <MessageSquareText size={9} />} Redo
            </button>
          </div>
        </>
      )}

      {/* Active caption overlay text */}
      {activeChunk && (
        <div className="px-3 py-1.5 border-t border-zinc-800/50 bg-black/30">
          <p className="text-[11px] text-white text-center">{activeChunk.text}</p>
        </div>
      )}

      {error && <p className="px-3 py-1 text-[9px] text-red-400">{error}</p>}
    </div>
  );
}

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

function toSrt(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")},${(ms % 1000).toString().padStart(3, "0")}`;
}
