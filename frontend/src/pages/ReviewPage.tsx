import { useState, useCallback, useEffect, useRef } from "react";
import { Download, RotateCcw, Undo2, Redo2 } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useProjectStore } from "../stores/projectStore";
import { useHistoryStore } from "../stores/historyStore";
import { apiClient } from "../services/apiClient";
import { VideoPlayer } from "../components/VideoPlayer";
import { Timeline } from "../components/Timeline";
import { ConfigPanel, type DetectionSettings } from "../components/ConfigPanel";
import { ExportDialog } from "../components/ExportDialog";
import type { SegmentDto } from "../types/dtos";

export function ReviewPage() {
  const { projectId, videoPath, duration, segments, setSegments, updateSegment } = useProjectStore();
  const { pushState, undo, redo, canUndo, canRedo } = useHistoryStore();
  const [detecting, setDetecting] = useState(false);
  const [showExport, setShowExport] = useState(false);
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
    if (projectId && segments.length === 0) runDetection(settings);
  }, [projectId]); // eslint-disable-line

  const handleConfigChange = useCallback((s: DetectionSettings) => {
    setSettings(s);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runDetection(s), 800);
  }, [runDetection]);

  const handleToggle = useCallback(async (segmentId: string) => {
    if (!projectId) return;
    const seg = segments.find((s: SegmentDto) => s.id === segmentId);
    if (!seg) return;
    try {
      const updated = await apiClient.toggleSegment(projectId, segmentId, !seg.is_removed);
      if (updated?.id) { pushState(segments); updateSegment(updated); }
    } catch (e) { setError(e instanceof Error ? e.message : "Toggle failed"); }
  }, [projectId, segments, updateSegment, pushState]);

  const handleTrimSegment = useCallback((segmentId: string, newStartMs: number, newEndMs: number) => {
    const seg = segments.find((s) => s.id === segmentId);
    if (!seg) return;
    pushState(segments);
    updateSegment({ ...seg, start_ms: Math.round(newStartMs), end_ms: Math.round(newEndMs) });
  }, [segments, updateSegment, pushState]);

  // Undo/Redo keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault(); const prev = undo(); if (prev) setSegments(prev);
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault(); const next = redo(); if (next) setSegments(next);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, setSegments]);

  if (!projectId || !videoPath) {
    return <div className="flex items-center justify-center h-full"><p className="text-zinc-500 text-sm">No project loaded</p></div>;
  }

  const keptCount = segments.filter((s) => !s.is_removed).length;
  const removedCount = segments.filter((s) => s.is_removed).length;
  const keptDuration = segments.filter((s) => !s.is_removed).reduce((a, s) => a + (s.end_ms - s.start_ms), 0);

  return (
    <>
      <Group orientation="vertical" className="h-full">
        {/* Top: Video + Config */}
        <Panel defaultSize={65} minSize={40}>
          <div className="flex h-full">
            {/* Video */}
            <div className="flex-1 flex flex-col items-center justify-center p-3 min-w-0 bg-[#111111]">
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

            {/* Right panel */}
            <div className="w-48 border-l border-zinc-800 flex flex-col bg-[#0a0a0a] shrink-0 overflow-y-auto">
              <ConfigPanel settings={settings} onChange={handleConfigChange} disabled={detecting} />
              <div className="p-2.5 space-y-1 border-b border-zinc-800 text-[11px]">
                <div className="flex justify-between"><span className="text-zinc-500">Segments</span><span className="text-zinc-300">{segments.length}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Keep</span><span className="text-emerald-400">{keptCount}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Remove</span><span className="text-red-400">{removedCount}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Output</span><span className="text-zinc-300">{(keptDuration / 1000).toFixed(1)}s</span></div>
              </div>
              <div className="p-2.5 space-y-1.5 mt-auto">
                <div className="flex gap-1">
                  <button onClick={() => { const p = undo(); if (p) setSegments(p); }} disabled={!canUndo()} className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 text-[10px] rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30" title="Ctrl+Z"><Undo2 size={10} /></button>
                  <button onClick={() => { const n = redo(); if (n) setSegments(n); }} disabled={!canRedo()} className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 text-[10px] rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30" title="Ctrl+Y"><Redo2 size={10} /></button>
                  <button onClick={() => runDetection(settings)} disabled={detecting} className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1.5 text-[10px] rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50" title="Re-detect"><RotateCcw size={10} /></button>
                </div>
                <button onClick={() => setShowExport(true)} disabled={keptCount === 0} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-md bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-colors">
                  <Download size={12} /> Export
                </button>
              </div>
            </div>
          </div>
        </Panel>

        {/* Resize handle */}
        <Separator className="h-1.5 bg-zinc-900 hover:bg-accent/30 transition-colors cursor-row-resize flex items-center justify-center">
          <div className="w-8 h-0.5 rounded-full bg-zinc-600" />
        </Separator>

        {/* Bottom: Timeline */}
        <Panel defaultSize={35} minSize={15}>
          <div className="h-full bg-[#0a0a0a] px-3 py-2 overflow-hidden">
            {detecting ? (
              <div className="h-full flex items-center justify-center">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-zinc-500">Analyzing...</span>
                </div>
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
        </Panel>
      </Group>

      {showExport && (
        <ExportDialog
          projectId={projectId}
          videoPath={videoPath}
          onClose={() => setShowExport(false)}
        />
      )}
    </>
  );
}
