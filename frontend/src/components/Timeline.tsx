import { useCallback, useRef, useState, useEffect } from "react";
import type { SegmentDto } from "../types/dtos";

interface TimelineProps {
  segments: SegmentDto[];
  duration: number;
  currentTime: number;
  projectId: string | null;
  onSeek: (timeMs: number) => void;
  onToggleSegment: (segmentId: string) => void;
  onTrimSegment: (segmentId: string, newStartMs: number, newEndMs: number) => void;
}

export function Timeline({ segments, duration, currentTime, projectId, onSeek, onToggleSegment, onTrimSegment }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null!);
  const trackRef = useRef<HTMLDivElement>(null!);
  const [zoom, setZoom] = useState(1);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [loadingThumbs, setLoadingThumbs] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [trimDrag, setTrimDrag] = useState<{ segId: string; side: "left" | "right"; startX: number; origMs: number } | null>(null);

  // Fetch thumbnails
  useEffect(() => {
    if (!projectId) return;
    setLoadingThumbs(true);
    const count = Math.min(40, Math.max(12, Math.ceil(duration / 800)));
    fetch(`http://localhost:18420/project/${projectId}/thumbnails?count=${count}&height=64`)
      .then((r) => r.json())
      .then((d) => { setThumbnails(d.thumbnails || []); setLoadingThumbs(false); })
      .catch(() => setLoadingThumbs(false));
  }, [projectId, duration]);

  // Zoom via Ctrl+Scroll
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => Math.max(1, Math.min(12, z + (e.deltaY < 0 ? 0.4 : -0.4))));
    }
  }, []);

  // Convert pixel X to time ms
  const pxToMs = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || duration === 0) return 0;
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    return (x / rect.width) * duration;
  }, [duration]);

  // Playhead drag — starts from ruler or playhead click
  const startPlayheadDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingPlayhead(true);
    onSeek(pxToMs(e.clientX));
  }, [pxToMs, onSeek]);

  useEffect(() => {
    if (!isDraggingPlayhead) return;
    const move = (e: MouseEvent) => onSeek(pxToMs(e.clientX));
    const up = () => setIsDraggingPlayhead(false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [isDraggingPlayhead, pxToMs, onSeek]);

  // Trim handle drag
  const startTrimDrag = useCallback((e: React.MouseEvent, segId: string, side: "left" | "right", ms: number) => {
    e.stopPropagation();
    e.preventDefault();
    setTrimDrag({ segId, side, startX: e.clientX, origMs: ms });
  }, []);

  useEffect(() => {
    if (!trimDrag) return;
    const move = (e: MouseEvent) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = e.clientX - trimDrag.startX;
      const msPerPx = duration / rect.width;
      const newMs = Math.max(0, Math.min(duration, trimDrag.origMs + dx * msPerPx));
      const seg = segments.find((s) => s.id === trimDrag.segId);
      if (!seg) return;
      if (trimDrag.side === "left") {
        onTrimSegment(seg.id, Math.min(newMs, seg.end_ms - 50), seg.end_ms);
      } else {
        onTrimSegment(seg.id, seg.start_ms, Math.max(newMs, seg.start_ms + 50));
      }
    };
    const up = () => setTrimDrag(null);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [trimDrag, segments, duration, onTrimSegment]);

  // Auto-scroll playhead into view
  useEffect(() => {
    if (!containerRef.current || !trackRef.current || duration === 0 || isDraggingPlayhead) return;
    const c = containerRef.current;
    const playheadPx = (currentTime / duration) * trackRef.current.clientWidth;
    const margin = 80;
    if (playheadPx < c.scrollLeft + margin) {
      c.scrollTo({ left: Math.max(0, playheadPx - margin), behavior: "smooth" });
    } else if (playheadPx > c.scrollLeft + c.clientWidth - margin) {
      c.scrollTo({ left: playheadPx - c.clientWidth + margin, behavior: "smooth" });
    }
  }, [currentTime, duration, isDraggingPlayhead]);

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col gap-1">
      {/* Top bar: time + zoom */}
      <div className="flex items-center justify-between px-2">
        <span className="text-[11px] text-emerald-400 font-mono tabular-nums">{fmtTime(currentTime)}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))} className="text-zinc-500 hover:text-zinc-300 text-xs px-1">−</button>
          <input
            type="range" min={1} max={10} step={0.1} value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-28 h-1 rounded-full appearance-none bg-zinc-700 accent-zinc-400 cursor-pointer"
          />
          <button onClick={() => setZoom((z) => Math.min(12, z + 0.5))} className="text-zinc-500 hover:text-zinc-300 text-xs px-1">+</button>
          <span className="text-[10px] text-zinc-500 w-8 text-right">{zoom.toFixed(1)}x</span>
        </div>
        <span className="text-[11px] text-zinc-500 font-mono tabular-nums">{fmtTime(duration)}</span>
      </div>

      {/* Scrollable timeline area */}
      <div ref={containerRef} className="overflow-x-auto overflow-y-visible relative" onWheel={handleWheel}>
        <div style={{ width: `${zoom * 100}%`, minWidth: "100%" }} className="relative">

          {/* Ruler — clickable/draggable to seek */}
          <div
            className="h-6 relative cursor-pointer select-none"
            onMouseDown={startPlayheadDrag}
          >
            {/* Ruler ticks */}
            {generateTicks(duration, zoom).map((tick) => (
              <div key={tick.ms} className="absolute top-0" style={{ left: `${(tick.ms / duration) * 100}%` }}>
                <div className={`w-px ${tick.major ? "h-4 bg-zinc-600" : "h-2 bg-zinc-800"}`} />
                {tick.major && (
                  <span className="absolute top-4 -translate-x-1/2 text-[9px] text-zinc-500 whitespace-nowrap">{tick.label}</span>
                )}
              </div>
            ))}

            {/* Playhead indicator on ruler — tall, easy to grab */}
            <div
              className="absolute top-0 -translate-x-1/2 z-30 cursor-grab active:cursor-grabbing"
              style={{ left: `${playheadPct}%` }}
            >
              {/* Triangle head */}
              <div className="w-3 h-3 bg-white rounded-sm rotate-45 transform origin-center translate-y-0.5 mx-auto" />
            </div>
          </div>

          {/* Track: thumbnails + overlays + playhead line */}
          <div ref={trackRef} className="relative h-16 rounded overflow-hidden bg-zinc-950 border border-zinc-800">
            {/* Loading state */}
            {loadingThumbs && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-10">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[10px] text-zinc-500">Loading timeline...</span>
                </div>
              </div>
            )}

            {/* Thumbnail strip */}
            {!loadingThumbs && thumbnails.length > 0 && (
              <div className="absolute inset-0 flex">
                {thumbnails.map((thumb, i) => (
                  <div key={i} className="flex-1 h-full overflow-hidden border-r border-zinc-900/50 last:border-r-0">
                    {thumb ? (
                      <img src={`data:image/jpeg;base64,${thumb}`} alt="" className="h-full w-full object-cover" draggable={false} />
                    ) : (
                      <div className="h-full w-full bg-zinc-800" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* No thumbnails fallback */}
            {!loadingThumbs && thumbnails.length === 0 && (
              <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
                <span className="text-[10px] text-zinc-600">No preview available</span>
              </div>
            )}

            {/* Segment overlays */}
            {segments.map((seg) => {
              const left = (seg.start_ms / duration) * 100;
              const width = ((seg.end_ms - seg.start_ms) / duration) * 100;
              return (
                <div key={seg.id} className="absolute top-0 bottom-0 group" style={{ left: `${left}%`, width: `${Math.max(width, 0.3)}%` }}>
                  {/* Red overlay for removed */}
                  {seg.is_removed && (
                    <div
                      className="absolute inset-0 bg-red-600/35 cursor-pointer hover:bg-red-600/20 transition-colors"
                      onClick={(e) => { e.stopPropagation(); onToggleSegment(seg.id); }}
                      title="Click to restore"
                    >
                      <div className="absolute inset-x-0 top-0 h-0.5 bg-red-500/60" />
                      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-red-500/60" />
                    </div>
                  )}

                  {/* Kept segment border */}
                  {!seg.is_removed && (
                    <div className="absolute inset-0 border-x border-cyan-500/30 pointer-events-none" />
                  )}

                  {/* Left trim handle */}
                  <div
                    onMouseDown={(e) => startTrimDrag(e, seg.id, "left", seg.start_ms)}
                    className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <div className="w-0.5 h-8 bg-cyan-400 rounded-full shadow-[0_0_6px_rgba(34,211,238,0.5)]" />
                  </div>

                  {/* Right trim handle */}
                  <div
                    onMouseDown={(e) => startTrimDrag(e, seg.id, "right", seg.end_ms)}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <div className="w-0.5 h-8 bg-cyan-400 rounded-full shadow-[0_0_6px_rgba(34,211,238,0.5)]" />
                  </div>
                </div>
              );
            })}

            {/* Playhead line — extends through track */}
            <div
              className="absolute top-0 bottom-0 z-30 pointer-events-none"
              style={{ left: `${playheadPct}%`, transition: isDraggingPlayhead ? "none" : "left 0.08s linear" }}
            >
              <div className="absolute -left-px top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${sec.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

function generateTicks(duration: number, zoom: number): { ms: number; major: boolean; label: string }[] {
  if (duration === 0) return [];
  const ticks: { ms: number; major: boolean; label: string }[] = [];
  const viewMs = duration / zoom;
  const step = Math.max(250, Math.round(viewMs / 20 / 250) * 250);
  const majorStep = step * 4;

  for (let ms = 0; ms <= duration; ms += step) {
    const major = ms % majorStep === 0;
    const s = Math.floor(ms / 1000);
    ticks.push({ ms, major, label: `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}` });
  }
  return ticks;
}
