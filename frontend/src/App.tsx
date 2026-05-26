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
  const { currentPage, setCurrentPage, setSidecarReady } = useAppStore();

  useEffect(() => {
    const setup = async () => {
      const unlisten = await listen<{ port: number }>("sidecar-ready", async () => {
        try { await apiClient.health(); setSidecarReady(true); } catch {}
      });
      return unlisten;
    };
    apiClient.health().then(() => setSidecarReady(true)).catch(() => {});
    const cleanup = setup();
    return () => { cleanup.then((fn) => fn()); };
  }, [setSidecarReady]);

  return (
    <AppShell currentPage={currentPage} onNavigate={setCurrentPage}>
      {currentPage === "import" && <ImportPage />}
      {currentPage === "review" && <ReviewPage />}
      {currentPage === "export" && <ExportPage />}
    </AppShell>
  );
}

export default App;
