import { useState, useCallback } from "react";
import { Download, CheckCircle } from "lucide-react";
import { useProjectStore } from "../stores/projectStore";
import { apiClient } from "../services/apiClient";

export function ExportPage() {
  const { projectId, videoPath, segments } = useProjectStore();
  const [exporting, setExporting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState("");

  const keptCount = segments.filter((s) => !s.is_removed).length;
  const removedCount = segments.filter((s) => s.is_removed).length;

  const handleExport = useCallback(async () => {
    if (!projectId || !videoPath) return;
    setExporting(true);
    setError(null);
    setDone(false);

    const ext = videoPath.split(".").pop() || "mp4";
    const out = videoPath.replace(`.${ext}`, `_trimmed.${ext}`);
    setOutputPath(out);

    try {
      await apiClient.submitTrim(projectId, out);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [projectId, videoPath]);

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-zinc-500 text-sm">No project loaded</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      <div className="w-full max-w-sm space-y-4">
        <div className="rounded-lg bg-background-elevated p-4 space-y-2">
          <h3 className="text-sm font-medium text-zinc-300">Summary</h3>
          <div className="flex justify-between text-xs text-zinc-500">
            <span>Segments kept</span>
            <span className="text-emerald-400">{keptCount}</span>
          </div>
          <div className="flex justify-between text-xs text-zinc-500">
            <span>Segments removed</span>
            <span className="text-red-400">{removedCount}</span>
          </div>
        </div>

        <button
          onClick={handleExport}
          disabled={exporting || keptCount === 0}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-accent text-white font-medium text-sm hover:bg-accent/80 disabled:opacity-50 transition-colors"
        >
          {exporting ? (
            "Exporting..."
          ) : done ? (
            <><CheckCircle size={16} /> Done</>
          ) : (
            <><Download size={16} /> Export Video</>
          )}
        </button>

        {done && (
          <p className="text-xs text-emerald-400 text-center break-all">{outputPath}</p>
        )}
        {error && (
          <p className="text-xs text-red-400 text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
