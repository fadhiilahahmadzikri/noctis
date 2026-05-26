import type { ProgressEventDto } from "../types/dtos";

const WS_BASE = "ws://localhost:18420";

export class ProgressSocket {
  private ws: WebSocket | null = null;

  constructor(private jobId: string) {}

  connect(
    onProgress: (event: ProgressEventDto) => void,
    onComplete: (event: ProgressEventDto) => void,
    onError: (error: string) => void
  ): void {
    this.ws = new WebSocket(`${WS_BASE}/ws/progress/${this.jobId}`);

    this.ws.onmessage = (event) => {
      const data: ProgressEventDto = JSON.parse(event.data);
      if (data.error) {
        onError(data.error);
        this.disconnect();
      } else if (data.is_complete) {
        onComplete(data);
        this.disconnect();
      } else {
        onProgress(data);
      }
    };

    this.ws.onerror = () => {
      onError("WebSocket connection failed");
      this.disconnect();
    };
  }

  cancel(): void {
    this.ws?.send(JSON.stringify({ type: "cancel" }));
    this.disconnect();
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
