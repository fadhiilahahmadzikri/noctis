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

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

export function Timeline({ segments, duration, currentTime, projectId, onSeek, onToggleSegment, onTrimSegment }: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null!);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState<{ segId: string; side: "left" | "right"; startX: number; origMs: number } | null>(null);
  const [waveform, setWaveform] = useState<number[]>([]);

  // Fetch waveform
  useEffect(() => {
    if (!projectId) return;
    fetch(`http://localhost:18420/project/${projectId}/waveform?samples=800`)
      .then((r) => r.json())
      .then((d) => setWaveform(d.waveform || []))
      .catch(() => {});
  }, [projectId]);

  const totalWidth = zoom * 100; // percentage width of inner track

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const newZoom = Math.max(1, Math.min(20, zoom + (e.deltaY > 0 ? -0.5 : 0.5)));
      setZoom(newZoom);
    }
  }, [zoom]);

  const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (dragging) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || duration === 0) return;
    const scrollContainer = trackRef.current.parentElement;
    const scrollOffset = scrollContainer?.scrollLeft || 0;
    const x = e.clientX - rect.left + scrollOffset;
    const ratio = x / rect.width;
    onSeek(ratio * duration);
  }, [duration, onSeek, dragging]);

  // Trim handle drag
  const handleTrimStart = useCallback((e: React.MouseEvent, segId: string, side: "left" | "right", currentMs: number) => {
    e.stopPropagation();
    e.preventDefault();
    setDragging({ segId, side, startX: e.clientX, origMs: currentMs });
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = e.clientX - dragging.startX;
      const msPerPx = duration / (rect.width);
      const deltaMs = dx * msPerPx;
      const newMs = Math.max(0, Math.min(duration, dragging.origMs + deltaMs));

      const seg = segments.find((s) => s.id === dragging.segId);
      if (!seg) return;

      if (dragging.side === "left") {
        const clampedStart = Math.min(newMs, seg.end_ms - 50);
        onTrimSegment(seg.id, Math.max(0, clampedStart), seg.end_ms);
      } else {
        const clampedEnd = Math.max(newMs, seg.start_ms + 50);
        onTrimSegment(seg.id, seg.start_ms, Math.min(duration, clampedEnd));
      }
    };
    const handleUp = () => setDragging(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, segments, duration, onTrimSegment]);

  const playheadPos = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="space-y-1">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-zinc-400 font-mono">{formatTime(currentTime)}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-600">Zoom</span>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-20 h-1 rounded-full appearance-none bg-zinc-700 accent-zinc-400"
          />
          <span className="text-xs text-zinc-500">{zoom.toFixed(1)}x</span>
        </div>
        <span className="text-xs text-zinc-400 font-mono">{formatTime(duration)}</span>
      </div>

      {/* Time ruler */}
      <div className="overflow-x-auto scrollbar-thin" onWheel={handleWheel}>
        <div style={{ width: `${totalWidth}%`, minWidth: "100%" }}>
          {/* Ruler ticks */}
          <div className="h-5 relative border-b border-zinc-800">
            {Array.from({ length: Math.ceil(duration / 1000) + 1 }, (_, i) => {
              const pos = (i * 1000 / duration) * 100;
              if (pos > 100) return null;
              return (
                <div key={i} className="absolute top-0 flex flex-col items-center" style={{ left: `${pos}%` }}>
                  <div className="w-px h-2 bg-zinc-700" />
                  {i % 5 === 0 && <span className="text-[9px] text-zinc-600 mt-0.5">{i}s</span>}
                </div>
              );
            })}
          </div>

          {/* Waveform + Segments track */}
          <div
            ref={trackRef}
            onClick={handleTrackClick}
            className="relative h-20 bg-zinc-900 rounded cursor-crosshair overflow-hidden"
          >
            {/* Waveform background */}
            {waveform.length > 0 && (
              <div className="absolute inset-0 flex items-end opacity-30 pointer-events-none">
                {waveform.map((v, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-zinc-500"
                    style={{ height: `${v * 100}%`, minWidth: "1px" }}
                  />
                ))}
              </div>
            )}

            {/* Segment blocks with trim handles */}
            {segments.map((seg) => {
              const left = (seg.start_ms / duration) * 100;
              const width = ((seg.end_ms - seg.start_ms) / duration) * 100;
              const isSpeech = seg.type === "speech";
              const isRemoved = seg.is_removed;

              return (
                <div
                  key={seg.id}
                  className={`absolute top-1 bottom-1 rounded group transition-colors ${
                    isRemoved
                      ? "bg-red-900/50 border border-red-700/60"
                      : isSpeech
                      ? "bg-emerald-700/50 border border-emerald-600/60"
                      : "bg-zinc-700/40 border border-zinc-600/40"
                  }`}
                  style={{ left: `${left}%`, width: `${Math.max(width, 0.2)}%` }}
                >
                  {/* Left trim handle */}
                  <div
                    onMouseDown={(e) => handleTrimStart(e, seg.id, "left", seg.start_ms)}
                    className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize bg-white/0 hover:bg-white/30 rounded-l transition-colors z-10"
                  />
                  {/* Right trim handle */}
                  <div
                    onMouseDown={(e) => handleTrimStart(e, seg.id, "right", seg.end_ms)}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize bg-white/0 hover:bg-white/30 rounded-r transition-colors z-10"
                  />
                  {/* Center click to toggle */}
                  <div
                    onClick={(e) => { e.stopPropagation(); onToggleSegment(seg.id); }}
                    className="absolute inset-0 mx-2 cursor-pointer"
                    title={`${isSpeech ? "Speech" : "Silence"} ${formatTime(seg.start_ms)}-${formatTime(seg.end_ms)} | Click to ${isRemoved ? "restore" : "remove"}`}
                  />
                  {/* Duration label */}
                  {width > 3 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white/60 pointer-events-none">
                      {((seg.end_ms - seg.start_ms) / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              );
            })}

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none"
              style={{ left: `${playheadPos}%` }}
            >
              <div className="absolute -top-1 -left-1.5 w-3.5 h-3 bg-white rounded-sm" style={{ clipPath: "polygon(50% 100%, 0 0, 100% 0)" }} />
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-[10px] text-zinc-500 px-1">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-700/50 border border-emerald-600/60" /> Speech (keep)</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-900/50 border border-red-700/60" /> Silence (remove)</span>
        <span className="ml-auto text-zinc-600">Ctrl+Scroll to zoom • Drag edges to trim • Click to toggle</span>
      </div>
    </div>
  );
}
