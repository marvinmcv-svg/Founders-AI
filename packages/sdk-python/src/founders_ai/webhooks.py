"""Verify webhook signatures: `X-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, t + "." + body)>`."""
from __future__ import annotations

import hashlib
import hmac
import time
from typing import Optional, Union


def sign(secret: str, body: Union[str, bytes], timestamp: Optional[int] = None) -> str:
    """Build a signature header (useful for testing your receiver)."""
    t = int(time.time()) if timestamp is None else int(timestamp)
    raw = body.encode() if isinstance(body, str) else body
    digest = hmac.new(secret.encode(), str(t).encode() + b"." + raw, hashlib.sha256).hexdigest()
    return f"t={t},v1={digest}"


def verify_signature(secret: str, body: Union[str, bytes], header: str, tolerance: int = 300, now: Optional[float] = None) -> bool:
    """True if `header` is a valid signature of the raw request `body`, no older than `tolerance` seconds.

    Always pass the raw body bytes exactly as received, before any JSON parsing.
    """
    try:
        parts = dict(p.split("=", 1) for p in header.split(","))
        t = int(parts["t"])
        given = parts["v1"]
    except (KeyError, ValueError):
        return False
    current = time.time() if now is None else now
    if abs(current - t) > tolerance:
        return False
    expected = sign(secret, body, t).split("v1=", 1)[1]
    return hmac.compare_digest(expected, given)
