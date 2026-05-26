import { useState, useCallback } from "react";
import { Plus, Film, Trash2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useProjectStore } from "../stores/projectStore";
import { apiClient, ApiError } from "../services/apiClient";

interface MediaAsset {
  id: string;
  path: string;
  name: string;
  durationMs: number;
  active: boolean;
}

export function MediaLibrary() {
  const { projectId, setProject } = useProjectStore();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = useCallback(async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "Video", extensions: ["mp4", "mkv", "mov", "avi", "webm"] }],
    });
    if (!selected) return;

    const paths = Array.isArray(selected) ? selected : [selected];
    setLoading(true);
    setError(null);

    for (const filePath of paths) {
      try {
        const fileName = filePath.split(/[/\\]/).pop() || "video.mp4";

        // Sidecar is local — pass path directly, no upload needed
        const project = await apiClient.loadProject(filePath);
        const asset: MediaAsset = {
          id: project.project_id,
          path: project.video_path,
          name: fileName,
          durationMs: project.duration_ms,
          active: !projectId,
        };
        setAssets((prev) => [...prev, asset]);

        if (!projectId) {
          setProject(project.project_id, project.video_path, project.duration_ms);
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : `Failed: ${filePath}`);
      }
    }
    setLoading(false);
  }, [projectId, setProject]);

  const handleSelect = useCallback(async (asset: MediaAsset) => {
    setAssets((prev) => prev.map((a) => ({ ...a, active: a.id === asset.id })));
    setProject(asset.id, asset.path, asset.durationMs);
    // Re-trigger detection for this project
    useProjectStore.getState().setSegments([]);
  }, [setProject]);

  const handleRemove = useCallback((id: string) => {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const fmtDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, "0")}`;
  };

  return (
    <div className="h-full flex flex-col bg-[#141414] border-r border-zinc-800/50">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-zinc-800/50">
        <button
          onClick={handleImport}
          disabled={loading}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-accent/10 border border-accent/30 text-accent text-[11px] font-medium hover:bg-accent/20 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          ) : (
            <Plus size={12} />
          )}
          Import Media
        </button>
      </div>

      {/* Asset grid */}
      <div className="flex-1 overflow-y-auto scrollbar-none p-2 space-y-1">
        {assets.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-32 text-zinc-600">
            <Film size={20} className="mb-1.5" />
            <span className="text-[10px]">No media</span>
          </div>
        )}

        {assets.map((asset) => (
          <div
            key={asset.id}
            onClick={() => handleSelect(asset)}
            className={`group relative rounded-md overflow-hidden cursor-pointer transition-all ${
              asset.active ? "ring-1 ring-accent" : "hover:ring-1 hover:ring-zinc-600"
            }`}
          >
            <div className="aspect-video bg-zinc-900 flex items-center justify-center">
              <Film size={16} className="text-zinc-700" />
            </div>
            {/* Overlay info */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1">
              <p className="text-[9px] text-zinc-300 truncate">{asset.name}</p>
              <p className="text-[8px] text-zinc-500">{fmtDuration(asset.durationMs)}</p>
            </div>
            {/* Remove button */}
            <button
              onClick={(e) => { e.stopPropagation(); handleRemove(asset.id); }}
              className="absolute top-1 right-1 p-0.5 rounded bg-black/60 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
      </div>

      {error && <p className="px-2 py-1 text-[9px] text-red-400 border-t border-zinc-800/50">{error}</p>}
    </div>
  );
}
