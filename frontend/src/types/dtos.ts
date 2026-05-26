export interface ProjectDto {
  project_id: string;
  duration_ms: number;
  video_path: string;
}

export interface SegmentDto {
  id: string;
  start_ms: number;
  end_ms: number;
  type: "speech" | "silence";
  is_removed: boolean;
}

export interface DetectionConfig {
  threshold: number;
  min_silence_duration_ms: number;
  speech_pad_ms: number;
}

export interface JobDto {
  job_id: string;
  status: "started" | "running" | "complete" | "error";
}

export interface ProgressEventDto {
  percent: number;
  message: string;
  current_ms: number;
  is_complete: boolean;
  error: string | null;
}
