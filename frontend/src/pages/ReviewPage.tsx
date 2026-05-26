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

  // Auto-detect on mount
  useEffect(() => {
    if (projectId && segments.length === 0) {
      runDetection(settings);
    }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-detect on config change (debounced)
  const handleConfigChange = useCallback((newSettings: DetectionSettings) => {
    setSettings(newSettings);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runDetection(newSettings);
    }, 800);
  }, [runDetection]);

  const handleToggle = useCallback(async (segmentId: string) => {
    if (!projectId) return;
    const seg = segments.find((s) => s.id === segmentId);
    if (!seg) return;
    try {
      const data = await apiClient.toggleSegment(projectId, segmentId, !seg.is_removed);
      updateSegment(data.segment);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toggle failed");
    }
  }, [projectId, segments, updateSegment]);

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

  const handleSeek = useCallback((timeMs: number) => {
    setCurrentTime(timeMs);
  }, []);

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
    <div className="flex h-full">
      {/* Main workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Video player */}
        <div className="p-3 pb-0">
          <VideoPlayer
            src={`http://localhost:18420/file?path=${encodeURIComponent(videoPath)}`}
            currentTime={currentTime}
            onTimeUpdate={setCurrentTime}
            onDurationChange={() => {}}
          />
        </div>

        {/* Timeline */}
        <div className="p-3">
          {detecting ? (
            <div className="h-12 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800">
              <span className="text-xs text-zinc-500 animate-pulse">Analyzing audio...</span>
            </div>
          ) : (
            <Timeline
              segments={segments}
              duration={duration}
              currentTime={currentTime}
              onSeek={handleSeek}
              onToggleSegment={handleToggle}
            />
          )}
        </div>

        {/* Segment list */}
        <div className="flex-1 overflow-auto px-3 pb-3">
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <div className="divide-y divide-zinc-800/50 max-h-40 overflow-auto">
              {segments.map((seg) => (
                <SegmentRow key={seg.id} segment={seg} onToggle={handleToggle} onSeek={handleSeek} />
              ))}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && <p className="px-3 pb-2 text-xs text-red-400">{error}</p>}
      </div>

      {/* Right panel: config + actions */}
      <div className="w-56 border-l border-zinc-800 flex flex-col bg-[#0a0a0a]">
        <ConfigPanel settings={settings} onChange={handleConfigChange} disabled={detecting} />

        {/* Stats */}
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
            <span className="text-zinc-500">Output duration</span>
            <span className="text-zinc-300">{(keptDuration / 1000).toFixed(1)}s</span>
          </div>
        </div>

        {/* Actions */}
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
  );
}

function SegmentRow({ segment, onToggle, onSeek }: { segment: SegmentDto; onToggle: (id: string) => void; onSeek: (ms: number) => void }) {
  const isSpeech = segment.type === "speech";
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-zinc-800/50 transition-colors ${segment.is_removed ? "opacity-40" : ""}`}
      onClick={() => onSeek(segment.start_ms)}
    >
      <div className={`w-1.5 h-1.5 rounded-full ${isSpeech ? "bg-emerald-500" : "bg-zinc-600"}`} />
      <span className="text-zinc-400 font-mono">
        {formatMs(segment.start_ms)}-{formatMs(segment.end_ms)}
      </span>
      <span className="text-zinc-600">{isSpeech ? "Speech" : "Silence"}</span>
      <span className="ml-auto text-zinc-600">{((segment.end_ms - segment.start_ms) / 1000).toFixed(1)}s</span>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(segment.id); }}
        className={`px-1.5 py-0.5 rounded text-xs ${segment.is_removed ? "text-emerald-400 hover:bg-emerald-900/30" : "text-red-400 hover:bg-red-900/30"}`}
      >
        {segment.is_removed ? "restore" : "cut"}
      </button>
    </div>
  );
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}
