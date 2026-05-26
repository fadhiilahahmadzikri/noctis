import { useState, useCallback } from "react";
import { Upload } from "lucide-react";
import { useProjectStore } from "../stores/projectStore";
import { useAppStore } from "../stores/appStore";
import { apiClient, ApiError } from "../services/apiClient";

export function ImportPage() {
  const [dragging, setDragging] = useState(false);
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile((file as unknown as {path?: string}).path || file.name);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile((file as unknown as {path?: string}).path || file.name);
  }, [handleFile]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`w-full max-w-md aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-colors cursor-pointer ${
          dragging ? "border-accent bg-accent/5" : "border-zinc-700 hover:border-zinc-500"
        }`}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <Upload size={32} className={dragging ? "text-accent" : "text-zinc-500"} />
        <p className="text-sm text-zinc-400">
          {loading ? "Loading..." : "Drop video file or click to browse"}
        </p>
        <p className="text-xs text-zinc-600">MP4, MKV, MOV, AVI</p>
      </div>

      <input
        id="file-input"
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileInput}
      />

      {error && (
        <p className="text-sm text-red-400 max-w-md text-center">{error}</p>
      )}
    </div>
  );
}
