import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import "./index.css";
import { Titlebar } from "./components/Titlebar";
import { EditorLayout } from "./components/EditorLayout";
import { ImportPage } from "./pages/ImportPage";
import { useAppStore } from "./stores/appStore";
import { useProjectStore } from "./stores/projectStore";
import { apiClient } from "./services/apiClient";

function App() {
  const { setSidecarReady } = useAppStore();
  const projectId = useProjectStore((s) => s.projectId);

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
    <div className="h-screen w-screen overflow-hidden flex flex-col">
      <Titlebar />
      <div className="flex-1 min-h-0">
        {projectId ? <EditorLayout /> : <ImportPage />}
      </div>
    </div>
  );
}

export default App;
