import { useState, useCallback, useEffect, useRef } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Download, RotateCcw, Play, Pause, SkipBack, SkipForward, Eye, EyeOff, MessageSquareText, Loader2, Film } from "lucide-react";
import { useProjectStore } from "../stores/projectStore";
import { useHistoryStore } from "../stores/historyStore";
import { apiClient } from "../services/apiClient";
import { Timeline } from "./Timeline";
import { ConfigPanel, type DetectionSettings } from "./ConfigPanel";
import { ExportDialog } from "./ExportDialog";
import { MediaLibrary } from "./MediaLibrary";
import { showToast } from "./Toast";

export function EditorLayout() {
  const { projectId, videoPath, duration, segments, setSegments, updateSegment } = useProjectStore();
  const { pushState } = useHistoryStore();
  const videoRef = useRef<HTMLVideoElement>(null!);
  const [detecting, setDetecting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showExport, setShowExport] = useState(false);
  const [captioning, setCaptioning] = useState(false);
  const [captions, setCaptions] = useState<{text: string; start_ms: number; end_ms: number}[]>([]);
  const [captionPos, setCaptionPos] = useState({ x: -1, y: -1 }); // -1 = auto center
  const [captionScale, setCaptionScale] = useState(1.0);
  const [settings, setSettings] = useState<DetectionSettings>({ threshold: 0.5, minSilenceDurationMs: 500, speechPadMs: 100 });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipLock = useRef(false);

  const runDetection = useCallback(async (config: DetectionSettings) => {
    if (!projectId) return;
    setDetecting(true);
    try {
      await apiClient.detectSilence(projectId, "auto", { threshold: config.threshold, min_silence_duration_ms: config.minSilenceDurationMs, speech_pad_ms: config.speechPadMs });
      const data = await apiClient.getSegments(projectId);
      setSegments(data.segments);
    } catch (e) { showToast(e instanceof Error ? e.message : "Detection failed"); }
    finally { setDetecting(false); }
  }, [projectId, setSegments]);

  useEffect(() => { if (projectId && segments.length === 0) runDetection(settings); }, [projectId]); // eslint-disable-line

  const handleConfigChange = useCallback((s: DetectionSettings) => {
    setSettings(s);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runDetection(s), 800);
  }, [runDetection]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  }, []);

  const seek = useCallback((ms: number) => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = ms / 1000; setCurrentTime(ms);
  }, []);

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

  const handleToggle = useCallback(async (segId: string) => {
    if (!projectId) return;
    const seg = segments.find((s) => s.id === segId); if (!seg) return;
    try { const u = await apiClient.toggleSegment(projectId, segId, !seg.is_removed); if (u?.id) { pushState(segments); updateSegment(u); } }
    catch (e) { showToast(e instanceof Error ? e.message : "Failed"); }
  }, [projectId, segments, updateSegment, pushState]);

  const handleTrim = useCallback((segId: string, start: number, end: number) => {
    const seg = segments.find((s) => s.id === segId); if (!seg) return;
    pushState(segments);
    updateSegment({ ...seg, start_ms: Math.round(start), end_ms: Math.round(end) });
  }, [segments, updateSegment, pushState]);

  const handleCaption = useCallback(async () => {
    if (!projectId) return;
    setCaptioning(true);
    try {
      const res = await fetch(`http://localhost:18420/project/${projectId}/transcribe`, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail); }
      const data = await res.json();
      setCaptions(data.chunks);
      // Position at bottom-center
      const parent = videoRef.current?.parentElement;
      if (parent) {
        setCaptionPos({ x: parent.clientWidth / 2, y: parent.clientHeight - 50 });
      }
      showToast(`Captions: ${data.chunks.length} words`, "success");
    } catch (e) { showToast(e instanceof Error ? e.message : "Caption failed"); }
    finally { setCaptioning(false); }
  }, [projectId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.ctrlKey && e.target === document.body) { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay]);

  const keptDuration = segments.filter((s) => !s.is_removed).reduce((a, s) => a + (s.end_ms - s.start_ms), 0);

  // Empty state — no project loaded
  if (!projectId || !videoPath) {
    return (
      <div className="h-full flex">
        <div className="w-48 shrink-0"><MediaLibrary /></div>
        <div className="flex-1 flex flex-col items-center justify-center bg-[#0d0d0d] gap-3">
          <Film size={40} className="text-zinc-800" />
          <p className="text-zinc-600 text-xs">Import media to start editing</p>
          <p className="text-zinc-700 text-[10px]">Drag & drop or use the panel on the left</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Group orientation="vertical" className="h-full">
        <Panel defaultSize={62} minSize={35}>
          <Group orientation="horizontal" className="h-full">
            <Panel defaultSize={15} minSize={10}>
              <MediaLibrary />
            </Panel>
            <Separator className="w-px bg-zinc-800/50 hover:bg-accent/30 transition-colors cursor-col-resize" />

            <Panel defaultSize={60} minSize={30}>
              <div className="flex flex-col h-full bg-[#0d0d0d]">
                <div className="flex-1 flex items-center justify-center p-2 min-h-0 relative">
                  <video ref={videoRef} src={`http://localhost:18420/file?path=${encodeURIComponent(videoPath)}`} className="max-h-full max-w-full rounded shadow-2xl" preload="metadata" />
                  {/* Caption overlay — draggable with snap guides, scale transform */}
                  {captions.length > 0 && (() => {
                    const windowStart = Math.max(0, currentTime - 500);
                    const windowEnd = currentTime + 2500;
                    const visible = captions.filter((c) => c.end_ms >= windowStart && c.start_ms <= windowEnd);
                    if (visible.length === 0) return null;

                    const parentEl = videoRef.current?.parentElement;
                    const parentW = parentEl?.clientWidth || 800;
                    const parentH = parentEl?.clientHeight || 450;
                    const isSnappedX = Math.abs(captionPos.x - parentW / 2) < 15;
                    const isSnappedY = Math.abs(captionPos.y - parentH / 2) < 15;

                    return (
                      <>
                        {isSnappedX && <div className="absolute top-0 bottom-0 left-1/2 w-px bg-red-500/50 z-30 pointer-events-none" />}
                        {isSnappedY && <div className="absolute left-0 right-0 top-1/2 h-px bg-red-500/50 z-30 pointer-events-none" />}

                        <div
                          className="absolute z-20 cursor-move select-none"
                          style={{
                            left: `${captionPos.x}px`,
                            top: `${captionPos.y}px`,
                            transform: `translate(-50%, -50%) scale(${captionScale})`,
                            transformOrigin: "center",
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const startX = e.clientX, startY = e.clientY;
                            const origX = captionPos.x, origY = captionPos.y;
                            const move = (ev: MouseEvent) => {
                              const nx = origX + (ev.clientX - startX);
                              const ny = origY + (ev.clientY - startY);
                              // Snap to center
                              const sx = Math.abs(nx - parentW / 2) < 15 ? parentW / 2 : nx;
                              const sy = Math.abs(ny - parentH / 2) < 15 ? parentH / 2 : ny;
                              setCaptionPos({ x: sx, y: sy });
                            };
                            const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
                            window.addEventListener("mousemove", move);
                            window.addEventListener("mouseup", up);
                          }}
                          onWheel={(e) => { e.stopPropagation(); setCaptionScale((s) => Math.max(0.5, Math.min(3, s + (e.deltaY > 0 ? -0.05 : 0.05)))); }}
                        >
                          <div className="px-3 py-1.5 rounded bg-black/70 whitespace-nowrap">
                            <p className="text-sm text-center leading-snug">
                              {visible.map((w, i) => {
                                const isActive = currentTime >= w.start_ms && currentTime <= w.end_ms;
                                const isPast = currentTime > w.end_ms;
                                return (
                                  <span key={i} className={isActive ? "text-accent font-bold" : isPast ? "text-white" : "text-white/40"}>
                                    {w.text}{" "}
                                  </span>
                                );
                              })}
                            </p>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="flex items-center justify-center gap-3 py-1.5 border-t border-zinc-800/30">
                  <button onClick={() => setPreviewMode(!previewMode)} className={`p-1 rounded transition-colors ${previewMode ? "text-accent" : "text-zinc-600 hover:text-zinc-400"}`} title="Preview mode">
                    {previewMode ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                  <button onClick={() => seek(Math.max(0, currentTime - 5000))} className="p-1 text-zinc-500 hover:text-white"><SkipBack size={13} /></button>
                  <button onClick={togglePlay} className="p-2 rounded-full bg-zinc-800 text-white hover:bg-zinc-700">
                    {playing ? <Pause size={13} /> : <Play size={13} />}
                  </button>
                  <button onClick={() => seek(Math.min(duration, currentTime + 5000))} className="p-1 text-zinc-500 hover:text-white"><SkipForward size={13} /></button>
                  <span className="text-[10px] text-zinc-500 font-mono tabular-nums">{fmtTime(currentTime)} / {fmtTime(duration)}</span>
                </div>
              </div>
            </Panel>
            <Separator className="w-px bg-zinc-800/50 hover:bg-accent/30 transition-colors cursor-col-resize" />

            <Panel defaultSize={25} minSize={14}>
              <div className="h-full bg-[#141414] flex flex-col overflow-y-auto scrollbar-none">
                <ConfigPanel settings={settings} onChange={handleConfigChange} disabled={detecting} duration={duration} outputDuration={keptDuration} />
                <div className="px-3 pb-2 text-[10px] text-zinc-600">{segments.length} segments</div>
                <div className="p-2.5 mt-auto space-y-1.5 border-t border-zinc-800/50">
                  <button onClick={handleCaption} disabled={captioning} className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-40 transition-colors">
                    {captioning ? <Loader2 size={10} className="animate-spin" /> : <MessageSquareText size={10} />} Caption
                  </button>
                  <button onClick={() => runDetection(settings)} disabled={detecting} className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-40 transition-colors">
                    <RotateCcw size={10} />{detecting ? "..." : "Re-detect"}
                  </button>
                  <button onClick={() => setShowExport(true)} className="w-full flex items-center justify-center gap-1 px-2 py-2 text-[11px] rounded-md bg-accent text-white hover:bg-accent/80 transition-colors font-medium">
                    <Download size={12} /> Export
                  </button>
                </div>
              </div>
            </Panel>
          </Group>
        </Panel>

        <Separator className="h-1 bg-[#0a0a0a] hover:bg-accent/30 transition-colors cursor-row-resize flex items-center justify-center">
          <div className="w-8 h-0.5 rounded-full bg-zinc-700" />
        </Separator>

        <Panel defaultSize={38} minSize={18}>
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

      {showExport && <ExportDialog projectId={projectId} videoPath={videoPath} captions={captions} onClose={() => setShowExport(false)} />}
    </>
  );
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000); const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}
