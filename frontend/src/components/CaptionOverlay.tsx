import { useState, useCallback, useRef, useEffect } from "react";
import { Mic, MicOff, Download } from "lucide-react";

interface CaptionEntry {
  id: number;
  text: string;
  startMs: number;
  endMs: number;
}

interface CaptionOverlayProps {
  isPlaying: boolean;
  currentTime: number;
}

export function CaptionOverlay({ isPlaying, currentTime }: CaptionOverlayProps) {
  const [enabled, setEnabled] = useState(false);
  const [currentCaption, setCurrentCaption] = useState("");
  const [captions, setCaptions] = useState<CaptionEntry[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const idCounter = useRef(0);
  const sessionStart = useRef(0);

  const startRecognition = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechCtor = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechCtor) { alert("Speech Recognition not supported"); return; }

    const recognition = new SpeechCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "id-ID";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result?.[0]) continue;
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text) {
            const entry: CaptionEntry = {
              id: idCounter.current++,
              text,
              startMs: sessionStart.current,
              endMs: currentTime,
            };
            setCaptions((prev) => [...prev, entry]);
            sessionStart.current = currentTime;
          }
        } else {
          interim += result[0].transcript;
        }
      }
      setCurrentCaption(interim);
    };

    recognition.onend = () => {
      // Auto-restart if still enabled
      if (recognitionRef.current) {
        try { recognition.start(); } catch {}
      }
    };

    recognition.onerror = () => {};
    recognitionRef.current = recognition;
    sessionStart.current = currentTime;
    recognition.start();
  }, [currentTime]);

  const stopRecognition = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setCurrentCaption("");
  }, []);

  const toggle = useCallback(() => {
    if (enabled) {
      stopRecognition();
      setEnabled(false);
    } else {
      setEnabled(true);
      startRecognition();
    }
  }, [enabled, startRecognition, stopRecognition]);

  // Stop when video pauses
  useEffect(() => {
    if (!isPlaying && recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    } else if (isPlaying && enabled && !recognitionRef.current) {
      startRecognition();
    }
  }, [isPlaying, enabled, startRecognition]);

  // Export as SRT
  const exportSRT = useCallback(() => {
    if (captions.length === 0) return;
    let srt = "";
    captions.forEach((c, i) => {
      srt += `${i + 1}\n`;
      srt += `${toSrtTime(c.startMs)} --> ${toSrtTime(c.endMs)}\n`;
      srt += `${c.text}\n\n`;
    });
    const blob = new Blob([srt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "captions.srt";
    a.click();
    URL.revokeObjectURL(url);
  }, [captions]);

  // Find active caption for current time
  const activeCaption = captions.find((c) => currentTime >= c.startMs && currentTime <= c.endMs);

  return (
    <div className="space-y-1">
      {/* Caption display */}
      <div className="h-6 flex items-center justify-center">
        {(currentCaption || activeCaption) && (
          <span className="px-2 py-0.5 rounded bg-black/70 text-white text-xs">
            {currentCaption || activeCaption?.text}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <button
          onClick={toggle}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
            enabled ? "bg-red-500/20 text-red-400 border border-red-500/40" : "text-zinc-500 hover:text-zinc-300 border border-zinc-700"
          }`}
        >
          {enabled ? <Mic size={10} /> : <MicOff size={10} />}
          {enabled ? "Captioning..." : "Auto Caption"}
        </button>

        {captions.length > 0 && (
          <button
            onClick={exportSRT}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-zinc-500 hover:text-zinc-300 border border-zinc-700"
          >
            <Download size={10} /> SRT ({captions.length})
          </button>
        )}
      </div>
    </div>
  );
}

function toSrtTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${cs.toString().padStart(3, "0")}`;
}

function pad(n: number): string { return n.toString().padStart(2, "0"); }
