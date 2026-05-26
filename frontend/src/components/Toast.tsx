import { useState, useCallback, useEffect } from "react";
import { X, AlertCircle, CheckCircle } from "lucide-react";

interface Toast {
  id: number;
  message: string;
  type: "error" | "success";
}

let toastId = 0;
const listeners: Set<(t: Toast) => void> = new Set();

export function showToast(message: string, type: "error" | "success" = "error") {
  const toast: Toast = { id: toastId++, message, type };
  listeners.forEach((fn) => fn(toast));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (t: Toast) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 4000);
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <div className="fixed top-12 right-3 z-50 space-y-1.5 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg text-xs animate-in slide-in-from-right ${
            t.type === "error" ? "bg-red-950 border border-red-800/50 text-red-200" : "bg-emerald-950 border border-emerald-800/50 text-emerald-200"
          }`}
        >
          {t.type === "error" ? <AlertCircle size={12} /> : <CheckCircle size={12} />}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="p-0.5 hover:opacity-70"><X size={10} /></button>
        </div>
      ))}
    </div>
  );
}
