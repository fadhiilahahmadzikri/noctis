import { create } from "zustand";

interface AppState {
  sidecarReady: boolean;
  setSidecarReady: (ready: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidecarReady: false,
  setSidecarReady: (ready) => set({ sidecarReady: ready }),
}));
