"""Progress emitter that logs to stdout (WebSocket wiring in presentation layer)."""

from loguru import logger


class LogProgressEmitter:
    """Emits progress via loguru. WebSocket streaming handled at route level."""

    def emit(self, percent: float, message: str) -> None:
        logger.info(f"[{percent:.1f}%] {message}")
