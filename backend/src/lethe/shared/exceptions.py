"""Shared application exceptions."""


class LetheError(Exception):
    """Base exception for Lethe application."""


class NotFoundError(LetheError):
    """Resource not found."""


class ValidationError(LetheError):
    """Input validation failed."""
