import { useState, useCallback } from "react";
import { Upload } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useProjectStore } from "../stores/projectStore";
import { useAppStore } from "../stores/appStore";
import { apiClient, ApiError } from "../services/apiClient";

export function ImportPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setProject = useProjectStore((s) => s.setProject);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  const handleFile = useCallback(async (path: string) => {
    setError(null);
    setLoading(true);
    try {
      const project = await apiClient.loadProject(path);
      setProject(project.project_id, project.video_path, project.duration_ms);
      setCurrentPage("review");
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Failed to load video");
    } finally {
      setLoading(false);
    }
  }, [setProject, setCurrentPage]);

  const handleClick = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Video", extensions: ["mp4", "mkv", "mov", "avi", "webm"] }],
    });
    if (selected) {
      handleFile(selected);
    }
  }, [handleFile]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      <div
        onClick={handleClick}
        className="w-full max-w-md aspect-video rounded-xl border-2 border-dashed border-zinc-700 hover:border-zinc-500 flex flex-col items-center justify-center gap-3 transition-colors cursor-pointer"
      >
        <Upload size={32} className="text-zinc-500" />
        <p className="text-sm text-zinc-400">
          {loading ? "Loading..." : "Click to select video file"}
        </p>
        <p className="text-xs text-zinc-600">MP4, MKV, MOV, AVI, WebM</p>
      </div>

      {error && (
        <p className="text-sm text-red-400 max-w-md text-center">{error}</p>
      )}
    </div>
  );
}
