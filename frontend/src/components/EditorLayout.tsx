import { useState, useCallback, useEffect, useRef } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Download, RotateCcw, Play, Pause, SkipBack, SkipForward, Eye, EyeOff } from "lucide-react";
import { useProjectStore } from "../stores/projectStore";
import { useHistoryStore } from "../stores/historyStore";
import { apiClient } from "../services/apiClient";
import { Timeline } from "./Timeline";
import { ConfigPanel, type DetectionSettings } from "./ConfigPanel";
import { ExportDialog } from "./ExportDialog";
import { MediaLibrary } from "./MediaLibrary";

export function EditorLayout() {
  const { projectId, videoPath, duration, segments, setSegments, updateSegment } = useProjectStore();
  const { pushState } = useHistoryStore();
  const videoRef = useRef<HTMLVideoElement>(null!);
  const [detecting, setDetecting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showExport, setShowExport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<DetectionSettings>({ threshold: 0.5, minSilenceDurationMs: 500, speechPadMs: 100 });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipLock = useRef(false);

  // Detection
  const runDetection = useCallback(async (config: DetectionSettings) => {
    if (!projectId) return;
    setDetecting(true); setError(null);
    try {
      await apiClient.detectSilence(projectId, "auto", { threshold: config.threshold, min_silence_duration_ms: config.minSilenceDurationMs, speech_pad_ms: config.speechPadMs });
      const data = await apiClient.getSegments(projectId);
      setSegments(data.segments);
    } catch (e) { setError(e instanceof Error ? e.message : "Detection failed"); }
    finally { setDetecting(false); }
  }, [projectId, setSegments]);

  useEffect(() => { if (projectId && segments.length === 0) runDetection(settings); }, [projectId]); // eslint-disable-line

  const handleConfigChange = useCallback((s: DetectionSettings) => {
    setSettings(s);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runDetection(s), 800);
  }, [runDetection]);

  // Video controls
  const togglePlay = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  }, []);

  const seek = useCallback((ms: number) => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = ms / 1000; setCurrentTime(ms);
  }, []);

  // Time update + preview skip
  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const handler = () => {
      const ms = v.currentTime * 1000; setCurrentTime(ms);
      if (previewMode && !skipLock.current && segments.length > 0) {
        const cur = segments.find((s) => ms >= s.start_ms && ms < s.end_ms);
        if (cur?.is_removed) {
          const next = segments.find((s) => !s.is_removed && s.start_ms >= cur.end_ms);
          if (next) { skipLock.current = true; v.currentTime = next.start_ms / 1000; setTimeout(() => { skipLock.current = false; }, 100); }
          else { v.pause(); setPlaying(false); }
        }
      }
    };
    v.addEventListener("timeupdate", handler);
    return () => v.removeEventListener("timeupdate", handler);
  }, [previewMode, segments]);

  // Segment actions
  const handleToggle = useCallback(async (segId: string) => {
    if (!projectId) return;
    const seg = segments.find((s) => s.id === segId); if (!seg) return;
    try { const u = await apiClient.toggleSegment(projectId, segId, !seg.is_removed); if (u?.id) { pushState(segments); updateSegment(u); } }
    catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
  }, [projectId, segments, updateSegment, pushState]);

  const handleTrim = useCallback((segId: string, start: number, end: number) => {
    const seg = segments.find((s) => s.id === segId); if (!seg) return;
    pushState(segments);
    updateSegment({ ...seg, start_ms: Math.round(start), end_ms: Math.round(end) });
  }, [segments, updateSegment, pushState]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.ctrlKey) { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay]);

  if (!projectId || !videoPath) {
    // Show empty editor with media library
    return (
      <div className="h-full flex">
        <div className="w-48 shrink-0"><MediaLibrary /></div>
        <div className="flex-1 flex items-center justify-center bg-[#0d0d0d]">
          <p className="text-zinc-600 text-xs">Import media to start editing</p>
        </div>
      </div>
    );
  }

  const keptDuration = segments.filter((s) => !s.is_removed).reduce((a, s) => a + (s.end_ms - s.start_ms), 0);

  return (
    <>
      <Group orientation="vertical" className="h-full">
        {/* Top: Video preview + right config */}
        <Panel defaultSize={62} minSize={35}>
          <div className="flex h-full">
            {/* Left: Media library */}
            <div className="w-48 shrink-0">
              <MediaLibrary />
            </div>

            {/* Video area */}
            <div className="flex-1 flex flex-col bg-[#0d0d0d] min-w-0">
              {/* Video */}
              <div className="flex-1 flex items-center justify-center p-2 min-h-0">
                <video
                  ref={videoRef}
                  src={`http://localhost:18420/file?path=${encodeURIComponent(videoPath)}`}
                  className="max-h-full max-w-full rounded shadow-2xl"
                  preload="metadata"
                />
              </div>
              {/* Transport bar */}
              <div className="flex items-center justify-center gap-3 py-2 border-t border-zinc-800/50">
                <button onClick={() => setPreviewMode(!previewMode)} className={`p-1.5 rounded transition-colors ${previewMode ? "text-accent" : "text-zinc-600 hover:text-zinc-400"}`} title="Preview mode">
                  {previewMode ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button onClick={() => seek(Math.max(0, currentTime - 5000))} className="p-1.5 text-zinc-500 hover:text-white transition-colors"><SkipBack size={14} /></button>
                <button onClick={togglePlay} className="p-2.5 rounded-full bg-zinc-800 text-white hover:bg-zinc-700 transition-colors">
                  {playing ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button onClick={() => seek(Math.min(duration, currentTime + 5000))} className="p-1.5 text-zinc-500 hover:text-white transition-colors"><SkipForward size={14} /></button>
                <span className="text-[11px] text-zinc-500 font-mono tabular-nums ml-2">{fmtTime(currentTime)} / {fmtTime(duration)}</span>
              </div>
            </div>

            {/* Right panel */}
            <div className="w-44 border-l border-zinc-800/50 bg-[#141414] flex flex-col shrink-0 overflow-y-auto scrollbar-none">
              <ConfigPanel settings={settings} onChange={handleConfigChange} disabled={detecting} />
              <div className="px-3 py-2 space-y-1 text-[10px] border-b border-zinc-800/50">
                <div className="flex justify-between"><span className="text-zinc-600">Segments</span><span className="text-zinc-400">{segments.length}</span></div>
                <div className="flex justify-between"><span className="text-zinc-600">Output</span><span className="text-zinc-400">{(keptDuration / 1000).toFixed(1)}s</span></div>
              </div>
              <div className="p-2.5 mt-auto space-y-1.5">
                <button onClick={() => runDetection(settings)} disabled={detecting} className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-40 transition-colors">
                  <RotateCcw size={10} />{detecting ? "..." : "Re-detect"}
                </button>
                <button onClick={() => setShowExport(true)} className="w-full flex items-center justify-center gap-1 px-2 py-2 text-[11px] rounded-md bg-accent text-white hover:bg-accent/80 transition-colors font-medium">
                  <Download size={12} /> Export
                </button>
              </div>
            </div>
          </div>
        </Panel>

        <Separator className="h-1 bg-[#0a0a0a] hover:bg-accent/30 transition-colors cursor-row-resize flex items-center justify-center">
          <div className="w-8 h-0.5 rounded-full bg-zinc-700" />
        </Separator>

        {/* Bottom: Timeline */}
        <Panel defaultSize={38} minSize={20}>
          <div className="h-full bg-[#0d0d0d] px-2 py-1.5 overflow-hidden">
            {detecting ? (
              <div className="h-full flex items-center justify-center">
                <div className="flex items-center gap-2"><div className="w-3 h-3 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin" /><span className="text-[10px] text-zinc-600">Analyzing...</span></div>
              </div>
            ) : (
              <Timeline segments={segments} duration={duration} currentTime={currentTime} projectId={projectId} onSeek={seek} onToggleSegment={handleToggle} onTrimSegment={handleTrim} />
            )}
          </div>
        </Panel>
      </Group>

      {error && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded bg-red-900/80 text-red-200 text-xs">{error}</div>}
      {showExport && <ExportDialog projectId={projectId} videoPath={videoPath} onClose={() => setShowExport(false)} />}
    </>
  );
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000); const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}
