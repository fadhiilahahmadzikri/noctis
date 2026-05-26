import { useRef, useEffect, useCallback, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Eye, EyeOff } from "lucide-react";
import { CaptionOverlay } from "./CaptionOverlay";
import type { SegmentDto } from "../types/dtos";

interface VideoPlayerProps {
  src: string;
  currentTime: number;
  segments: SegmentDto[];
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
}

export function VideoPlayer({ src, currentTime, segments, onTimeUpdate, onDurationChange }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null!);
  const [playing, setPlaying] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const skipLock = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handler = () => {
      const timeMs = video.currentTime * 1000;
      onTimeUpdate(timeMs);

      // Preview mode: skip removed segments
      if (previewMode && !skipLock.current && segments.length > 0) {
        const currentSeg = segments.find(
          (s) => timeMs >= s.start_ms && timeMs < s.end_ms
        );
        if (currentSeg && currentSeg.is_removed) {
          // Find next kept segment
          const nextKept = segments.find(
            (s) => !s.is_removed && s.start_ms >= currentSeg.end_ms
          );
          if (nextKept) {
            skipLock.current = true;
            video.currentTime = nextKept.start_ms / 1000;
            setTimeout(() => { skipLock.current = false; }, 100);
          } else {
            video.pause();
            setPlaying(false);
          }
        }
      }
    };
    video.addEventListener("timeupdate", handler);
    return () => video.removeEventListener("timeupdate", handler);
  }, [onTimeUpdate, previewMode, segments]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handler = () => onDurationChange(video.duration * 1000);
    video.addEventListener("loadedmetadata", handler);
    return () => video.removeEventListener("loadedmetadata", handler);
  }, [onDurationChange]);

  // Sync external seek
  useEffect(() => {
    const video = videoRef.current;
    if (!video || playing) return;
    const diff = Math.abs(video.currentTime * 1000 - currentTime);
    if (diff > 200) {
      video.currentTime = currentTime / 1000;
    }
  }, [currentTime, playing]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { video.play(); setPlaying(true); }
    else { video.pause(); setPlaying(false); }
  }, []);

  const skip = useCallback((ms: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, video.currentTime + ms / 1000);
  }, []);

  return (
    <div className="flex flex-col bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        src={src}
        className="w-full aspect-video bg-black"
        preload="metadata"
      />
      <CaptionOverlay isPlaying={playing} currentTime={currentTime} />
      <div className="flex items-center justify-between px-3 py-2 bg-[#0a0a0a]">
        <button
          onClick={() => setPreviewMode(!previewMode)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
            previewMode
              ? "bg-accent/20 text-accent border border-accent/40"
              : "text-zinc-500 hover:text-zinc-300 border border-transparent"
          }`}
          title={previewMode ? "Preview mode: skipping removed segments" : "Enable preview (skip removed segments)"}
        >
          {previewMode ? <Eye size={12} /> : <EyeOff size={12} />}
          {previewMode ? "Preview ON" : "Preview"}
        </button>

        <div className="flex items-center gap-1">
          <button onClick={() => skip(-5000)} className="p-1.5 text-zinc-400 hover:text-white transition-colors">
            <SkipBack size={14} />
          </button>
          <button onClick={togglePlay} className="p-2 rounded-full bg-zinc-800 text-white hover:bg-zinc-700 transition-colors">
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button onClick={() => skip(5000)} className="p-1.5 text-zinc-400 hover:text-white transition-colors">
            <SkipForward size={14} />
          </button>
        </div>

        <span className="text-xs text-zinc-500 font-mono w-16 text-right">
          {formatTime(currentTime)}
        </span>
      </div>
    </div>
  );
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}
