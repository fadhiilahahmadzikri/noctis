"""Dependency injection composition root."""


class Container:
    """Wires concrete implementations to port interfaces.

    This is the only place that knows about concrete adapters.
    Populated when infrastructure implementations are added.
    """
