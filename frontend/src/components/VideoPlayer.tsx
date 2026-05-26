import { useRef, useEffect, useCallback, useState } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";

interface VideoPlayerProps {
  src: string;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
}

export function VideoPlayer({ src, currentTime, onTimeUpdate, onDurationChange }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null!);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handler = () => onTimeUpdate(video.currentTime * 1000);
    video.addEventListener("timeupdate", handler);
    return () => video.removeEventListener("timeupdate", handler);
  }, [onTimeUpdate]);

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
      <div className="flex items-center justify-center gap-2 py-2 bg-[#0a0a0a]">
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
    </div>
  );
}
