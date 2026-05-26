import { useCallback, useRef } from "react";
import type { SegmentDto } from "../types/dtos";

interface TimelineProps {
  segments: SegmentDto[];
  duration: number;
  currentTime: number;
  onSeek: (timeMs: number) => void;
  onToggleSegment: (segmentId: string) => void;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function Timeline({ segments, duration, currentTime, onSeek, onToggleSegment }: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || duration === 0) return;
      const x = e.clientX - rect.left;
      const ratio = x / rect.width;
      onSeek(ratio * duration);
    },
    [duration, onSeek]
  );

  const playheadPos = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="space-y-2">
      {/* Time display */}
      <div className="flex justify-between text-xs text-zinc-500 px-1">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Timeline track */}
      <div
        ref={trackRef}
        onClick={handleClick}
        className="relative h-16 bg-zinc-900 rounded-lg cursor-crosshair overflow-hidden border border-zinc-800"
      >
        {/* Segment blocks */}
        {segments.map((seg) => {
          const left = (seg.start_ms / duration) * 100;
          const width = ((seg.end_ms - seg.start_ms) / duration) * 100;
          const isSpeech = seg.type === "speech";
          const isRemoved = seg.is_removed;

          return (
            <div
              key={seg.id}
              onClick={(e) => { e.stopPropagation(); onToggleSegment(seg.id); }}
              title={`${isSpeech ? "Speech" : "Silence"} ${formatTime(seg.start_ms)}-${formatTime(seg.end_ms)}${isRemoved ? " (removed)" : ""}`}
              className={`absolute top-1 bottom-1 rounded transition-all cursor-pointer hover:brightness-125 ${
                isRemoved
                  ? "bg-red-900/40 border border-red-800/50"
                  : isSpeech
                  ? "bg-emerald-600/60"
                  : "bg-zinc-700/60"
              }`}
              style={{ left: `${left}%`, width: `${Math.max(width, 0.3)}%` }}
            />
          );
        })}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white z-10 pointer-events-none"
          style={{ left: `${playheadPos}%` }}
        >
          <div className="absolute -top-0.5 -left-1 w-2.5 h-2.5 bg-white rounded-full" />
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-zinc-500 px-1">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600/60" /> Keep
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-900/40 border border-red-800/50" /> Remove
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-zinc-700/60" /> Silence (auto)
        </span>
      </div>
    </div>
  );
}
