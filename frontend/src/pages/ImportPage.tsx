import { useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useProjectStore } from "../stores/projectStore";
import { apiClient, ApiError } from "../services/apiClient";

export function ImportPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setProject = useProjectStore((s) => s.setProject);

  const handleClick = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Video", extensions: ["mp4", "mkv", "mov", "avi", "webm"] }],
    });
    if (!selected) return;
    setError(null);
    setLoading(true);
    try {
      const project = await apiClient.loadProject(selected);
      setProject(project.project_id, project.video_path, project.duration_ms);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load video");
    } finally {
      setLoading(false);
    }
  }, [setProject]);

  return (
    <div className="h-full flex items-center justify-center bg-[#0d0d0d]">
      <div
        onClick={handleClick}
        className="flex flex-col items-center gap-4 cursor-pointer group"
      >
        <div className="w-16 h-16 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center group-hover:bg-accent/20 group-hover:border-accent/50 transition-all">
          {loading ? (
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          ) : (
            <Plus size={24} className="text-accent" />
          )}
        </div>
        <div className="text-center">
          <p className="text-sm text-zinc-300">{loading ? "Loading..." : "Click to import"}</p>
          <p className="text-[10px] text-zinc-600 mt-1">MP4, MKV, MOV, AVI, WebM</p>
        </div>
        {error && <p className="text-xs text-red-400 max-w-xs text-center">{error}</p>}
      </div>
    </div>
  );
}
