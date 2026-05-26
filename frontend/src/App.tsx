import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import "./index.css";
import { AppShell } from "./components/AppShell";
import { ImportPage } from "./pages/ImportPage";
import { ReviewPage } from "./pages/ReviewPage";
import { ExportPage } from "./pages/ExportPage";
import { useAppStore } from "./stores/appStore";
import { apiClient } from "./services/apiClient";

function App() {
  const { currentPage, setCurrentPage, sidecarReady, setSidecarReady } = useAppStore();

  useEffect(() => {
    const setup = async () => {
      const unlisten = await listen<{ port: number }>("sidecar-ready", async () => {
        try {
          await apiClient.health();
          setSidecarReady(true);
        } catch {
          // Sidecar signaled ready but health check failed — retry
          setTimeout(async () => {
            try {
              await apiClient.health();
              setSidecarReady(true);
            } catch { /* will remain not ready */ }
          }, 1000);
        }
      });
      return unlisten;
    };

    // Also try direct health check (for dev mode without Tauri)
    apiClient.health().then(() => setSidecarReady(true)).catch(() => {});

    const cleanup = setup();
    return () => { cleanup.then((fn) => fn()); };
  }, [setSidecarReady]);

  return (
    <AppShell currentPage={currentPage} onNavigate={setCurrentPage}>
      {!sidecarReady && (
        <div className="flex items-center justify-center h-full">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-zinc-500 text-sm">Connecting to backend...</span>
          </div>
        </div>
      )}
      {sidecarReady && currentPage === "import" && <ImportPage />}
      {sidecarReady && currentPage === "review" && <ReviewPage />}
      {sidecarReady && currentPage === "export" && <ExportPage />}
    </AppShell>
  );
}

export default App;
