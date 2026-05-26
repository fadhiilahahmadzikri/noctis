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
  const trackRef = useRef<HTMLDivElement>(null!);
  const scrollRef = useRef<HTMLDivElement>(null!);
  const [zoom, setZoom] = useState(1);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [dragging, setDragging] = useState<{ segId: string; side: "left" | "right"; startX: number; origMs: number } | null>(null);

  // Fetch thumbnails
  useEffect(() => {
    if (!projectId) return;
    const count = Math.min(40, Math.max(10, Math.ceil(duration / 1000)));
    fetch(`http://localhost:18420/project/${projectId}/thumbnails?count=${count}&height=64`)
      .then((r) => r.json())
      .then((d) => setThumbnails(d.thumbnails || []))
      .catch(() => {});
  }, [projectId, duration]);

  // Auto-scroll to keep playhead visible
  useEffect(() => {
    if (!scrollRef.current || !trackRef.current || duration === 0) return;
    const container = scrollRef.current;
    const trackWidth = trackRef.current.clientWidth;
    const playheadPx = (currentTime / duration) * trackWidth;
    const viewLeft = container.scrollLeft;
    const viewRight = viewLeft + container.clientWidth;
    if (playheadPx < viewLeft + 50 || playheadPx > viewRight - 50) {
      container.scrollTo({ left: playheadPx - container.clientWidth / 2, behavior: "smooth" });
    }
  }, [currentTime, duration]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => Math.max(1, Math.min(15, z + (e.deltaY > 0 ? -0.3 : 0.3))));
    }
  }, []);

  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if (dragging) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || duration === 0) return;
    const x = e.clientX - rect.left;
    onSeek((x / rect.width) * duration);
  }, [duration, onSeek, dragging]);

  // Trim drag logic
  const handleTrimStart = useCallback((e: React.MouseEvent, segId: string, side: "left" | "right", ms: number) => {
    e.stopPropagation();
    e.preventDefault();
    setDragging({ segId, side, startX: e.clientX, origMs: ms });
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = e.clientX - dragging.startX;
      const msPerPx = duration / rect.width;
      const newMs = Math.max(0, Math.min(duration, dragging.origMs + dx * msPerPx));
      const seg = segments.find((s) => s.id === dragging.segId);
      if (!seg) return;
      if (dragging.side === "left") {
        onTrimSegment(seg.id, Math.min(newMs, seg.end_ms - 50), seg.end_ms);
      } else {
        onTrimSegment(seg.id, seg.start_ms, Math.max(newMs, seg.start_ms + 50));
      }
    };
    const handleUp = () => setDragging(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => { window.removeEventListener("mousemove", handleMove); window.removeEventListener("mouseup", handleUp); };
  }, [dragging, segments, duration, onTrimSegment]);

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="space-y-1.5">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] text-zinc-400 font-mono tabular-nums">{fmtTime(currentTime)}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-600">Zoom</span>
          <input
            type="range" min={1} max={10} step={0.1} value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-24 h-1 rounded-full appearance-none bg-zinc-700 accent-zinc-400"
          />
          <span className="text-[10px] text-zinc-500 w-6">{zoom.toFixed(1)}x</span>
        </div>
        <span className="text-[11px] text-zinc-400 font-mono tabular-nums">{fmtTime(duration)}</span>
      </div>

      {/* Scrollable timeline */}
      <div ref={scrollRef} className="overflow-x-auto overflow-y-hidden" onWheel={handleWheel}>
        <div style={{ width: `${zoom * 100}%`, minWidth: "100%" }}>
          {/* Time ruler */}
          <div className="h-4 relative mb-0.5">
            {generateTicks(duration, zoom).map((tick) => (
              <div key={tick.ms} className="absolute top-0 flex flex-col items-center" style={{ left: `${(tick.ms / duration) * 100}%` }}>
                <div className={`w-px ${tick.major ? "h-3 bg-zinc-600" : "h-1.5 bg-zinc-800"}`} />
                {tick.major && <span className="text-[8px] text-zinc-600 leading-none">{tick.label}</span>}
              </div>
            ))}
          </div>

          {/* Main track: thumbnails + overlays */}
          <div
            ref={trackRef}
            onClick={handleTrackClick}
            className="relative h-16 rounded cursor-crosshair overflow-hidden bg-zinc-950 border border-zinc-800"
          >
            {/* Thumbnail strip */}
            <div className="absolute inset-0 flex">
              {thumbnails.map((thumb, i) => (
                <div key={i} className="flex-1 h-full overflow-hidden">
                  {thumb && (
                    <img
                      src={`data:image/jpeg;base64,${thumb}`}
                      alt=""
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Segment overlays */}
            {segments.map((seg) => {
              const left = (seg.start_ms / duration) * 100;
              const width = ((seg.end_ms - seg.start_ms) / duration) * 100;
              return (
                <div key={seg.id} className="absolute top-0 bottom-0" style={{ left: `${left}%`, width: `${Math.max(width, 0.2)}%` }}>
                  {/* Overlay: removed segments get red tint */}
                  {seg.is_removed && (
                    <div
                      className="absolute inset-0 bg-red-500/30 backdrop-brightness-50 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); onToggleSegment(seg.id); }}
                      title="Click to restore"
                    />
                  )}
                  {/* Left trim handle */}
                  <div
                    onMouseDown={(e) => handleTrimStart(e, seg.id, "left", seg.start_ms)}
                    className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-cyan-400/60 transition-colors z-10 group"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-cyan-400/0 group-hover:bg-cyan-400 transition-colors" />
                  </div>
                  {/* Right trim handle */}
                  <div
                    onMouseDown={(e) => handleTrimStart(e, seg.id, "right", seg.end_ms)}
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-cyan-400/60 transition-colors z-10 group"
                  >
                    <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-cyan-400/0 group-hover:bg-cyan-400 transition-colors" />
                  </div>
                  {/* Border for non-removed segments */}
                  {!seg.is_removed && (
                    <div className="absolute inset-0 border border-cyan-500/20 rounded-sm pointer-events-none" />
                  )}
                </div>
              );
            })}

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 z-20 pointer-events-none transition-[left] duration-75 ease-linear"
              style={{ left: `${playheadPct}%` }}
            >
              <div className="absolute -left-px top-0 bottom-0 w-0.5 bg-white shadow-[0_0_4px_rgba(255,255,255,0.5)]" />
              <div className="absolute -left-1.5 -top-1 w-3 h-3 bg-white rounded-full shadow-lg" />
            </div>
          </div>
        </div>
      </div>

      {/* Hints */}
      <div className="flex gap-3 text-[9px] text-zinc-600 px-1">
        <span>Ctrl+Scroll = zoom</span>
        <span>Drag edges = trim</span>
        <span>Click red = restore</span>
        <span>Ctrl+Z = undo</span>
      </div>
    </div>
  );
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${(s % 60).toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

function generateTicks(duration: number, zoom: number): { ms: number; major: boolean; label: string }[] {
  const ticks: { ms: number; major: boolean; label: string }[] = [];
  const step = Math.max(500, Math.floor(2000 / zoom));
  const majorEvery = Math.max(1, Math.floor(5000 / step));
  for (let ms = 0; ms <= duration; ms += step) {
    const idx = Math.round(ms / step);
    const major = idx % majorEvery === 0;
    const s = Math.floor(ms / 1000);
    ticks.push({ ms, major, label: `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}` });
  }
  return ticks;
}
