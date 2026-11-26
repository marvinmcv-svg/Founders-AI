"""Errors raised by the client. The API answers errors as RFC 7807 problem+json."""
from __future__ import annotations

from typing import Any, Dict, Optional


class FoundersAIError(Exception):
    """Base class for every error raised by this package."""


class APIError(FoundersAIError):
    """A non-2xx response. `problem` holds the parsed problem+json body."""

    def __init__(self, status: int, problem: Dict[str, Any], request_id: Optional[str] = None) -> None:
        self.status = status
        self.problem = problem
        self.title = str(problem.get("title") or f"HTTP {status}")
        self.detail = problem.get("detail")
        self.request_id = request_id
        msg = f"{status} {self.title}"
        if self.detail:
            msg += f": {self.detail}"
        if request_id:
            msg += f" (request {request_id})"
        super().__init__(msg)


class AuthenticationError(APIError):
    """401: missing, invalid, pending or revoked key."""


class InsufficientCreditsError(APIError):
    """402: not enough credits. `problem` carries `needed` and `balance`."""


class PermissionDeniedError(APIError):
    """403: the key lacks a scope (e.g. write:webhooks)."""


class NotFoundError(APIError):
    """404: no such record. Misses are never charged."""


class RateLimitError(APIError):
    """429 after all retries were used."""


class NotAvailableYetError(APIError):
    """501: the endpoint exists in the spec but launches in a later release."""


def error_for(status: int, problem: Dict[str, Any], request_id: Optional[str]) -> APIError:
    cls = {401: AuthenticationError, 402: InsufficientCreditsError, 403: PermissionDeniedError, 404: NotFoundError, 429: RateLimitError, 501: NotAvailableYetError}.get(status, APIError)
    return cls(status, problem, request_id)
