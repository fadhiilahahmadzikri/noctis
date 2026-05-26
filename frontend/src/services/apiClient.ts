import type { ProjectDto, SegmentDto, JobDto, DetectionConfig } from "../types/dtos";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:18420";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json() as Promise<T>;
}

export const apiClient = {
  health: () => request<{ status: string }>("/health"),

  uploadVideo: async (file: File): Promise<{ path: string; filename: string }> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE_URL}/upload`, { method: "POST", body: form });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json();
  },

  loadProject: (videoPath: string) =>
    request<ProjectDto>("/project/load", {
      method: "POST",
      body: JSON.stringify({ video_path: videoPath }),
    }),

  detectSilence: (projectId: string, mode: "auto" | "manual", config: DetectionConfig) =>
    request<JobDto>(`/project/${projectId}/detect`, {
      method: "POST",
      body: JSON.stringify({ mode, config }),
    }),

  getSegments: (projectId: string) =>
    request<{ segments: SegmentDto[] }>(`/project/${projectId}/segments`),

  toggleSegment: (projectId: string, segmentId: string, isRemoved: boolean) =>
    request<SegmentDto>(`/project/${projectId}/segment/${segmentId}`, {
      method: "PATCH",
      body: JSON.stringify({ is_removed: isRemoved }),
    }),

  submitTrim: (projectId: string, outputPath: string, captions: {text: string; start_ms: number; end_ms: number}[] = []) =>
    request<JobDto>(`/project/${projectId}/trim`, {
      method: "POST",
      body: JSON.stringify({ output_path: outputPath, captions }),
    }),
};
