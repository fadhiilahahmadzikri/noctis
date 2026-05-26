import { create } from "zustand";
import type { SegmentDto, ProgressEventDto } from "../types/dtos";

interface ProjectState {
  projectId: string | null;
  videoPath: string | null;
  duration: number;
  segments: SegmentDto[];
  processingJob: { jobId: string; progress: ProgressEventDto } | null;

  setProject: (id: string, path: string, duration: number) => void;
  setSegments: (segments: SegmentDto[]) => void;
  updateSegment: (segment: SegmentDto) => void;
  setProcessingJob: (jobId: string | null) => void;
  updateProgress: (progress: ProgressEventDto) => void;
  reset: () => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projectId: null,
  videoPath: null,
  duration: 0,
  segments: [],
  processingJob: null,

  setProject: (id, path, duration) => set({ projectId: id, videoPath: path, duration }),
  setSegments: (segments) => set({ segments }),
  updateSegment: (segment) =>
    set((state) => ({
      segments: state.segments.map((s) => (s.id === segment.id ? segment : s)),
    })),
  setProcessingJob: (jobId) =>
    set({ processingJob: jobId ? { jobId, progress: { percent: 0, message: "", current_ms: 0, is_complete: false, error: null } } : null }),
  updateProgress: (progress) =>
    set((state) => state.processingJob ? { processingJob: { ...state.processingJob, progress } } : {}),
  reset: () => set({ projectId: null, videoPath: null, duration: 0, segments: [], processingJob: null }),
}));
