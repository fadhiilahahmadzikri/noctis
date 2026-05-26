import { create } from "zustand";

type Page = "import" | "review" | "export";

interface AppState {
  sidecarReady: boolean;
  currentPage: Page;
  setSidecarReady: (ready: boolean) => void;
  setCurrentPage: (page: Page) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidecarReady: false,
  currentPage: "import",
  setSidecarReady: (ready) => set({ sidecarReady: ready }),
  setCurrentPage: (page) => set({ currentPage: page }),
}));
