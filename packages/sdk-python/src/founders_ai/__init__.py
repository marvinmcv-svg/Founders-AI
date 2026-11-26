"""Founders AI Python SDK."""
from .client import DEFAULT_BASE_URL, FoundersAI, Result
from .errors import (
    APIError,
    AuthenticationError,
    FoundersAIError,
    InsufficientCreditsError,
    NotAvailableYetError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitError,
)
from .webhooks import sign as sign_webhook
from .webhooks import verify_signature as verify_webhook_signature

__version__ = "0.1.0"
__all__ = [
    "FoundersAI", "Result", "DEFAULT_BASE_URL", "APIError", "AuthenticationError", "FoundersAIError", "InsufficientCreditsError",
    "NotAvailableYetError", "NotFoundError", "PermissionDeniedError", "RateLimitError", "sign_webhook", "verify_webhook_signature",
]
