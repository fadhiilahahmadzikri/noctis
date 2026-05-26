import { create } from "zustand";
import type { SegmentDto } from "../types/dtos";

interface HistoryState {
  past: SegmentDto[][];
  present: SegmentDto[];
  future: SegmentDto[][];

  setSegments: (segments: SegmentDto[]) => void;
  pushState: (segments: SegmentDto[]) => void;
  undo: () => SegmentDto[] | null;
  redo: () => SegmentDto[] | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  present: [],
  future: [],

  setSegments: (segments) => set({ present: segments, past: [], future: [] }),

  pushState: (segments) => {
    const { present, past } = get();
    set({
      past: [...past.slice(-30), present], // keep max 30 undo steps
      present: segments,
      future: [],
    });
  },

  undo: () => {
    const { past, present, future } = get();
    if (past.length === 0) return null;
    const prev = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      present: prev,
      future: [present, ...future],
    });
    return prev;
  },

  redo: () => {
    const { past, present, future } = get();
    if (future.length === 0) return null;
    const next = future[0];
    set({
      past: [...past, present],
      present: next,
      future: future.slice(1),
    });
    return next;
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));
