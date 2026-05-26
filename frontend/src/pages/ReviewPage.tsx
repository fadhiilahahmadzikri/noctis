import { useState, useCallback, useEffect, useRef } from "react";
import { Download, RotateCcw } from "lucide-react";
import { useProjectStore } from "../stores/projectStore";
import { apiClient } from "../services/apiClient";
import { VideoPlayer } from "../components/VideoPlayer";
import { Timeline } from "../components/Timeline";
import { ConfigPanel, type DetectionSettings } from "../components/ConfigPanel";
import type { SegmentDto } from "../types/dtos";

export function ReviewPage() {
  const { projectId, videoPath, duration, segments, setSegments, updateSegment } = useProjectStore();
  const [detecting, setDetecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [settings, setSettings] = useState<DetectionSettings>({
    threshold: 0.5,
    minSilenceDurationMs: 500,
    speechPadMs: 100,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runDetection = useCallback(async (config: DetectionSettings) => {
    if (!projectId) return;
    setDetecting(true);
    setError(null);
    setExportDone(false);
    try {
      await apiClient.detectSilence(projectId, "auto", {
        threshold: config.threshold,
        min_silence_duration_ms: config.minSilenceDurationMs,
        speech_pad_ms: config.speechPadMs,
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
      runDetection(settings);
    }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConfigChange = useCallback((newSettings: DetectionSettings) => {
    setSettings(newSettings);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runDetection(newSettings);
    }, 800);
  }, [runDetection]);

  const handleToggle = useCallback(async (segmentId: string) => {
    if (!projectId) return;
    const seg = segments.find((s: SegmentDto) => s.id === segmentId);
    if (!seg) return;
    try {
      const updated = await apiClient.toggleSegment(projectId, segmentId, !seg.is_removed);
      if (updated && updated.id) {
        updateSegment(updated);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toggle failed");
    }
  }, [projectId, segments, updateSegment]);

  const handleTrimSegment = useCallback((segmentId: string, newStartMs: number, newEndMs: number) => {
    // Non-destructive: update local state only (metadata edit)
    const seg = segments.find((s) => s.id === segmentId);
    if (!seg) return;
    updateSegment({ ...seg, start_ms: Math.round(newStartMs), end_ms: Math.round(newEndMs) });
  }, [segments, updateSegment]);

  const handleExport = useCallback(async () => {
    if (!projectId || !videoPath) return;
    setExporting(true);
    setError(null);
    const ext = videoPath.split(".").pop() || "mp4";
    const out = videoPath.replace(`.${ext}`, `_trimmed.${ext}`);
    try {
      await apiClient.submitTrim(projectId, out);
      setExportDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [projectId, videoPath]);

  if (!projectId || !videoPath) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-zinc-500 text-sm">No project loaded</p>
      </div>
    );
  }

  const keptCount = segments.filter((s) => !s.is_removed).length;
  const removedCount = segments.filter((s) => s.is_removed).length;
  const keptDuration = segments.filter((s) => !s.is_removed).reduce((sum, s) => sum + (s.end_ms - s.start_ms), 0);

  return (
    <div className="flex flex-col h-full">
      {/* Top: Video preview (dominant) + Right panel */}
      <div className="flex flex-1 min-h-0">
        {/* Center: Video preview */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 min-w-0 bg-[#111111]">
          <div className="w-full max-w-3xl">
            <VideoPlayer
              src={`http://localhost:18420/file?path=${encodeURIComponent(videoPath)}`}
              currentTime={currentTime}
              segments={segments}
              onTimeUpdate={setCurrentTime}
              onDurationChange={() => {}}
            />
          </div>
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>

        {/* Right: Config + Stats + Actions */}
        <div className="w-52 border-l border-zinc-800 flex flex-col bg-[#0a0a0a] shrink-0 overflow-y-auto">
          <ConfigPanel settings={settings} onChange={handleConfigChange} disabled={detecting} />

          <div className="p-3 space-y-1.5 border-b border-zinc-800">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Segments</span>
              <span className="text-zinc-300">{segments.length}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Keep</span>
              <span className="text-emerald-400">{keptCount}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Remove</span>
              <span className="text-red-400">{removedCount}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Output</span>
              <span className="text-zinc-300">{(keptDuration / 1000).toFixed(1)}s</span>
            </div>
          </div>

          <div className="p-3 space-y-2 mt-auto">
            <button
              onClick={() => runDetection(settings)}
              disabled={detecting}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
            >
              <RotateCcw size={12} />
              {detecting ? "Detecting..." : "Re-detect"}
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || keptCount === 0}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-md bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-colors"
            >
              <Download size={12} />
              {exporting ? "Exporting..." : exportDone ? "Done!" : "Export"}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom: Timeline (full width, like CapCut) */}
      <div className="shrink-0 border-t border-zinc-800 bg-[#0a0a0a] px-4 py-3">
        {detecting ? (
          <div className="h-16 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800">
            <span className="text-xs text-zinc-500 animate-pulse">Analyzing audio...</span>
          </div>
        ) : (
          <Timeline
            segments={segments}
            duration={duration}
            currentTime={currentTime}
            projectId={projectId}
            onSeek={setCurrentTime}
            onToggleSegment={handleToggle}
            onTrimSegment={handleTrimSegment}
          />
        )}
      </div>
    </div>
  );
}
