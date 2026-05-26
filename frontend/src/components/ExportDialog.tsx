import { useState, useCallback } from "react";
import { X, Download, CheckCircle } from "lucide-react";
import { apiClient } from "../services/apiClient";

interface ExportDialogProps {
  projectId: string;
  videoPath: string;
  onClose: () => void;
}

const RESOLUTIONS = [
  { label: "Original", value: "original", desc: "Same as source" },
  { label: "1080p", value: "1080", desc: "1920×1080" },
  { label: "720p", value: "720", desc: "1280×720" },
  { label: "480p", value: "480", desc: "854×480" },
] as const;

export function ExportDialog({ projectId, videoPath, onClose }: ExportDialogProps) {
  const [resolution, setResolution] = useState<string>("original");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState("");

  const handleExport = useCallback(async () => {
    setExporting(true);
    setError(null);
    setProgress(0);

    const ext = videoPath.split(".").pop() || "mp4";
    const suffix = resolution === "original" ? "" : `_${resolution}p`;
    const out = videoPath.replace(`.${ext}`, `_trimmed${suffix}.${ext}`);
    setOutputPath(out);

    // Simulate progress (actual encoding happens server-side)
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 15, 90));
    }, 500);

    try {
      await apiClient.submitTrim(projectId, out);
      clearInterval(interval);
      setProgress(100);
      setDone(true);
    } catch (e) {
      clearInterval(interval);
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [projectId, videoPath, resolution]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-[#1a1a1a] border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-200">Export Video</h3>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {!done ? (
            <>
              {/* Resolution picker */}
              <div className="space-y-2">
                <label className="text-xs text-zinc-400 font-medium">Resolution</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {RESOLUTIONS.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setResolution(r.value)}
                      disabled={exporting}
                      className={`px-3 py-2 rounded-lg text-left transition-colors ${
                        resolution === r.value
                          ? "bg-accent/20 border border-accent/50 text-accent"
                          : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:border-zinc-600"
                      } disabled:opacity-50`}
                    >
                      <div className="text-xs font-medium">{r.label}</div>
                      <div className="text-[10px] opacity-60">{r.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Progress */}
              {exporting && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>Encoding...</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-red-400">{error}</p>}

              {/* Export button */}
              <button
                onClick={handleExport}
                disabled={exporting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-white font-medium text-sm hover:bg-accent/80 disabled:opacity-50 transition-colors"
              >
                <Download size={14} />
                {exporting ? "Exporting..." : "Start Export"}
              </button>
            </>
          ) : (
            /* Done state */
            <div className="text-center space-y-3 py-2">
              <CheckCircle size={32} className="mx-auto text-emerald-400" />
              <div>
                <p className="text-sm text-zinc-200">Export Complete</p>
                <p className="text-[10px] text-zinc-500 mt-1 break-all">{outputPath}</p>
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700 transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
