"""Shared application exceptions."""


class NoctisError(Exception):
    """Base exception for Noctis application."""


class NotFoundError(NoctisError):
    """Resource not found."""


class ValidationError(NoctisError):
    """Input validation failed."""
