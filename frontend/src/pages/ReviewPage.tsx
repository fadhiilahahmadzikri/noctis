import { useState, useCallback, useEffect } from "react";
import { Trash2, RotateCcw } from "lucide-react";
import { useProjectStore } from "../stores/projectStore";
import { useAppStore } from "../stores/appStore";
import { apiClient } from "../services/apiClient";
import type { SegmentDto } from "../types/dtos";

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function ReviewPage() {
  const { projectId, segments, setSegments, updateSegment } = useProjectStore();
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runDetection = useCallback(async () => {
    if (!projectId) return;
    setDetecting(true);
    setError(null);
    try {
      await apiClient.detectSilence(projectId, "auto", {
        threshold: 0.5,
        min_silence_duration_ms: 1000,
        speech_pad_ms: 200,
      });
      const data = await apiClient.getSegments(projectId);
      setSegments(data.segments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Detection failed");
    } finally {
      setDetecting(false);
    }
  }, [projectId, setSegments]);

  useEffect(() => {
    if (projectId && segments.length === 0) {
      runDetection();
    }
  }, [projectId, segments.length, runDetection]);

  const handleToggle = useCallback(async (seg: SegmentDto) => {
    if (!projectId) return;
    try {
      const data = await apiClient.toggleSegment(projectId, seg.id, !seg.is_removed);
      updateSegment(data.segment);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toggle failed");
    }
  }, [projectId, updateSegment]);

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-zinc-500 text-sm">No project loaded</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-300">
          Segments {segments.length > 0 && `(${segments.length})`}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={runDetection}
            disabled={detecting}
            className="px-3 py-1.5 text-xs rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
          >
            {detecting ? "Detecting..." : "Re-detect"}
          </button>
          <button
            onClick={() => setCurrentPage("export")}
            disabled={segments.length === 0}
            className="px-3 py-1.5 text-xs rounded-md bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-colors"
          >
            Export →
          </button>
        </div>
      </div>

      {error && <p className="px-4 py-2 text-xs text-red-400">{error}</p>}

      <div className="flex-1 overflow-auto">
        {detecting && (
          <div className="flex items-center justify-center h-32">
            <p className="text-zinc-500 text-sm animate-pulse">Analyzing audio...</p>
          </div>
        )}
        {!detecting && segments.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <p className="text-zinc-500 text-sm">No segments detected</p>
          </div>
        )}
        <div className="divide-y divide-zinc-800/50">
          {segments.map((seg) => (
            <div
              key={seg.id}
              className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                seg.is_removed ? "opacity-40" : ""
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  seg.type === "speech" ? "bg-emerald-500" : "bg-zinc-600"
                }`}
              />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-zinc-400">
                  {formatTime(seg.start_ms)} — {formatTime(seg.end_ms)}
                </span>
                <span className="ml-2 text-xs text-zinc-600">
                  {seg.type === "speech" ? "Speech" : "Silence"}
                </span>
              </div>
              <span className="text-xs text-zinc-600 w-12 text-right">
                {((seg.end_ms - seg.start_ms) / 1000).toFixed(1)}s
              </span>
              <button
                onClick={() => handleToggle(seg)}
                className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                title={seg.is_removed ? "Restore" : "Remove"}
              >
                {seg.is_removed ? <RotateCcw size={14} /> : <Trash2 size={14} />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
