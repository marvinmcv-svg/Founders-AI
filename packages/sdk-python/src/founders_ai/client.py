"""Thin, dependency-free client for the Founders AI REST API (plan Section 11).

    from founders_ai import FoundersAI
    fa = FoundersAI()                      # reads FOUNDERS_AI_API_KEY
    company = fa.companies.get("com_...")
    for round_ in fa.paginate(fa.transactions.funding_rounds, announced_date_after="2026-01-01"):
        ...

Every result is a `Result` (a dict) that also exposes `credits_charged`, `credits_remaining` and
`request_id`. 429s are retried after `Retry-After`; 5xx and network errors are retried with
exponential backoff. POSTs get an automatic Idempotency-Key so retries never double-charge.
"""
from __future__ import annotations

import json as _json
import os
import random
import time
import uuid
from typing import Any, Callable, Dict, Iterable, Iterator, List, Optional
from urllib import error as urlerror
from urllib import parse, request

from .errors import APIError, FoundersAIError, error_for

__all__ = ["FoundersAI", "Result", "DEFAULT_BASE_URL"]

DEFAULT_BASE_URL = os.environ.get("FOUNDERS_AI_BASE_URL", "https://founders-ai-app.vercel.app/api/v1")
USER_AGENT = "founders-ai-python/0.1.0"
Params = Optional[Dict[str, Any]]


class Result(dict):  # type: ignore[type-arg]
    """A JSON object response plus credit and request metadata from the response headers."""

    credits_charged: Optional[int] = None
    credits_remaining: Optional[int] = None
    request_id: Optional[str] = None
    replayed: bool = False


def _int(v: Optional[str]) -> Optional[int]:
    try:
        return int(v) if v is not None else None
    except ValueError:
        return None


class FoundersAI:
    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None, timeout: float = 30.0, max_retries: int = 3) -> None:
        key = api_key or os.environ.get("FOUNDERS_AI_API_KEY")
        if not key:
            raise FoundersAIError("Pass api_key or set FOUNDERS_AI_API_KEY")
        self.api_key = key
        self.base_url = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.companies = _Companies(self)
        self.people = _People(self)
        self.investors = _Investors(self)
        self.transactions = _Transactions(self)
        self.signals = _Signals(self)
        self.search = _Search(self)
        self.searches = _SavedSearches(self)
        self.lists = _Lists(self)
        self.network = _Network(self)
        self.account = _Account(self)
        self.webhooks = _Webhooks(self)

    # ------------------------------------------------------------------ transport

    def request(self, method: str, path: str, params: Params = None, json: Any = None, idempotency_key: Optional[str] = None) -> Result:
        query = {k: _fmt(v) for k, v in (params or {}).items() if v is not None}
        url = f"{self.base_url}{path}" + (f"?{parse.urlencode(query)}" if query else "")
        body = _json.dumps(json).encode() if json is not None else None
        headers = {"X-API-Key": self.api_key, "Accept": "application/json", "User-Agent": USER_AGENT}
        if body is not None:
            headers["Content-Type"] = "application/json"
        if method == "POST":
            headers["Idempotency-Key"] = idempotency_key or f"py-{uuid.uuid4()}"
        attempt = 0
        while True:
            try:
                req = request.Request(url, data=body, headers=headers, method=method)
                with request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310 (https base URL)
                    return _result(resp.status, resp.headers, resp.read())
            except urlerror.HTTPError as e:
                raw = e.read()
                retry = e.code == 429 or e.code >= 500
                if retry and e.code != 501 and attempt < self.max_retries:
                    attempt += 1
                    time.sleep(_delay(attempt, e.headers.get("Retry-After")))
                    continue
                problem: Dict[str, Any]
                try:
                    problem = _json.loads(raw or b"{}")
                except ValueError:
                    problem = {"title": raw.decode(errors="replace")[:200]}
                raise error_for(e.code, problem, e.headers.get("X-Request-Id")) from None
            except (urlerror.URLError, TimeoutError, ConnectionError) as e:
                if attempt < self.max_retries:
                    attempt += 1
                    time.sleep(_delay(attempt, None))
                    continue
                raise FoundersAIError(f"Network error calling {method} {path}: {e}") from e

    def paginate(self, fn: Callable[..., Result], *args: Any, limit: int = 100, max_items: Optional[int] = None, **kwargs: Any) -> Iterator[Dict[str, Any]]:
        """Yield every item of a cursor-paginated endpoint, following `next_cursor`."""
        cursor: Optional[str] = None
        seen = 0
        while True:
            page = fn(*args, limit=limit, cursor=cursor, **kwargs)
            for item in page.get("items", []):
                yield item
                seen += 1
                if max_items is not None and seen >= max_items:
                    return
            cursor = page.get("next_cursor")
            if not cursor:
                return


def _fmt(v: Any) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (list, tuple)):
        return ",".join(str(x) for x in v)
    return str(v)


def _delay(attempt: int, retry_after: Optional[str]) -> float:
    if retry_after:
        try:
            return max(0.0, float(retry_after))
        except ValueError:
            pass
    return min(8.0, 0.5 * 2 ** (attempt - 1)) + random.uniform(0, 0.25)


def _result(status: int, headers: Any, raw: bytes) -> Result:
    data = _json.loads(raw) if raw else {}
    r = Result(data if isinstance(data, dict) else {"items": data})
    r.credits_charged = _int(headers.get("X-Credits-Charged"))
    r.credits_remaining = _int(headers.get("X-Credits-Remaining"))
    r.request_id = headers.get("X-Request-Id")
    r.replayed = headers.get("Idempotent-Replayed") == "true"
    return r


def _q(s: str) -> str:
    return parse.quote(s, safe="")


class _Resource:
    def __init__(self, client: FoundersAI) -> None:
        self._c = client

    def _get(self, path: str, **params: Any) -> Result:
        return self._c.request("GET", path, params=params)

    def _post(self, path: str, body: Any, idempotency_key: Optional[str] = None) -> Result:
        return self._c.request("POST", path, json=body, idempotency_key=idempotency_key)


Identifier = Dict[str, str]  # {"domain": ...} | {"name": ...} | {"linkedin_url": ...} | {"email": ...}


class _Companies(_Resource):
    def get(self, company_id: str) -> Result: return self._get(f"/companies/{_q(company_id)}")
    def enrich(self, items: List[Identifier]) -> Result: return self._post("/companies", {"items": items})
    def resolve(self, items: List[Identifier]) -> Result: return self._post("/companies/resolve", {"items": items})
    def search_by_text(self, text: str, limit: int = 10) -> Result: return self._post("/companies/search-by-text", {"text": text, "limit": limit})
    def people(self, company_id: str, **page: Any) -> Result: return self._get(f"/companies/{_q(company_id)}/people", **page)
    def competitors(self, company_id: str, min_overlap: Optional[float] = None, **page: Any) -> Result: return self._get(f"/companies/{_q(company_id)}/competitors", min_overlap=min_overlap, **page)
    def funding_rounds(self, company_id: str, **page: Any) -> Result: return self._get(f"/companies/{_q(company_id)}/funding-rounds", **page)
    def acquisitions(self, company_id: str, **page: Any) -> Result: return self._get(f"/companies/{_q(company_id)}/acquisitions", **page)
    def ipos(self, company_id: str) -> Result: return self._get(f"/companies/{_q(company_id)}/ipos")
    def latest_revenue(self, company_id: str) -> Result: return self._get(f"/companies/{_q(company_id)}/latest-revenue")
    def latest_valuation(self, company_id: str) -> Result: return self._get(f"/companies/{_q(company_id)}/latest-valuation")
    def revenue_history(self, company_id: str) -> Result: return self._get(f"/companies/{_q(company_id)}/revenue-history")
    def news_signals(self, company_id: str, **page: Any) -> Result: return self._get(f"/companies/{_q(company_id)}/news-signals", **page)
    def investor_interest_signals(self, company_id: str, **page: Any) -> Result: return self._get(f"/companies/{_q(company_id)}/investor-interest-signals", **page)
    def traction(self, company_id: str) -> Result: return self._get(f"/companies/{_q(company_id)}/traction")


class _People(_Resource):
    def get(self, person_id: str) -> Result: return self._get(f"/people/{_q(person_id)}")
    def enrich(self, items: List[Identifier]) -> Result: return self._post("/people", {"items": items})
    def resolve(self, items: List[Identifier]) -> Result: return self._post("/people/resolve", {"items": items})
    def by_email(self, email: str) -> Result: return self._post("/people/by-email", {"email": email})
    def email(self, person_id: str) -> Result: return self._get(f"/people/{_q(person_id)}/email")
    def talent_signals(self, person_id: str, **page: Any) -> Result: return self._get(f"/people/{_q(person_id)}/talent-signals", **page)
    def experience(self, person_id: str) -> Result: return self._get(f"/people/{_q(person_id)}/experience")
    def investments(self, person_id: str, **page: Any) -> Result: return self._get(f"/people/{_q(person_id)}/investments", **page)


class _Investors(_Resource):
    def get(self, investor_id: str) -> Result: return self._get(f"/investors/{_q(investor_id)}")
    def resolve(self, items: List[Identifier]) -> Result: return self._post("/investors/resolve", {"items": items})
    def portfolio(self, investor_id: str, **page: Any) -> Result: return self._get(f"/investors/{_q(investor_id)}/portfolio", **page)
    def funding_rounds(self, investor_id: str, **page: Any) -> Result: return self._get(f"/investors/{_q(investor_id)}/funding-rounds", **page)
    def investor_interest_signals(self, investor_id: str, **page: Any) -> Result: return self._get(f"/investors/{_q(investor_id)}/investor-interest-signals", **page)
    def co_investors(self, investor_id: str, **page: Any) -> Result: return self._get(f"/investors/{_q(investor_id)}/co-investors", **page)


class _Transactions(_Resource):
    def funding_rounds(self, **params: Any) -> Result: return self._get("/funding-rounds", **params)
    def funding_round(self, round_id: str) -> Result: return self._get(f"/funding-rounds/{_q(round_id)}")
    def acquisitions(self, **page: Any) -> Result: return self._get("/acquisitions", **page)
    def ipos(self, **page: Any) -> Result: return self._get("/ipos", **page)


class _Signals(_Resource):
    def talent(self, **params: Any) -> Result: return self._get("/talent", **params)
    def talent_signal(self, signal_id: str) -> Result: return self._get(f"/talent/{_q(signal_id)}")
    def investor_interest(self, **params: Any) -> Result: return self._get("/investor-interest", **params)
    def investor_interest_signal(self, signal_id: str) -> Result: return self._get(f"/investor-interest/{_q(signal_id)}")
    def revenue(self, **params: Any) -> Result: return self._get("/revenue-signals", **params)
    def news(self, **params: Any) -> Result: return self._get("/news-signals", **params)


class _Search(_Resource):
    def ai(self, query: str, product: Optional[str] = None, limit: int = 25) -> Result:
        body: Dict[str, Any] = {"query": query, "limit": limit}
        if product:
            body["product"] = product
        return self._post("/search", body)

    def results(self, query_id: str, **page: Any) -> Result: return self._get(f"/search/{_q(query_id)}/results", **page)

    def extract_entities(self, text: str, types: Optional[Iterable[str]] = None) -> Result:
        body: Dict[str, Any] = {"text": text}
        if types:
            body["types"] = list(types)
        return self._post("/entities/extract", body)

    def taxonomy(self) -> Result: return self._get("/taxonomy")


SAVED_SEARCH_PRODUCTS = ("companies", "people", "investors", "talent", "investor-interest", "transactions")


class _SavedSearches(_Resource):
    def list(self) -> Result: return self._get("/searches")
    def create(self, **fields: Any) -> Result: return self._post("/searches", fields)
    def get(self, search_id: str) -> Result: return self._get(f"/searches/{_q(search_id)}")
    def update(self, search_id: str, **fields: Any) -> Result: return self._c.request("PATCH", f"/searches/{_q(search_id)}", json=fields)
    def delete(self, search_id: str) -> Result: return self._c.request("DELETE", f"/searches/{_q(search_id)}")

    def results(self, product: str, search_id: str, new_since_last_read: Optional[bool] = None, **page: Any) -> Result:
        if product not in SAVED_SEARCH_PRODUCTS:
            raise FoundersAIError(f"product must be one of {', '.join(SAVED_SEARCH_PRODUCTS)}")
        return self._get(f"/searches/{product}/{_q(search_id)}/results", new_since_last_read=new_since_last_read, **page)


class _Lists(_Resource):
    def list(self, type: Optional[str] = None) -> Result: return self._get("/lists", type=type)  # noqa: A002
    def create(self, name: str, type: str, **fields: Any) -> Result: return self._post("/lists", {"name": name, "type": type, **fields})  # noqa: A002
    def get(self, list_id: str) -> Result: return self._get(f"/lists/{_q(list_id)}")
    def update(self, list_id: str, **fields: Any) -> Result: return self._c.request("PATCH", f"/lists/{_q(list_id)}", json=fields)
    def delete(self, list_id: str) -> Result: return self._c.request("DELETE", f"/lists/{_q(list_id)}")
    def results(self, kind: str, list_id: str, **page: Any) -> Result: return self._get(f"/lists/{kind}/{_q(list_id)}/results", **page)

    def modify(self, kind: str, list_id: str, add: Optional[List[str]] = None, remove: Optional[List[str]] = None) -> Result:
        return self._c.request("PATCH", f"/lists/{kind}/{_q(list_id)}", json={"add": add or [], "remove": remove or []})


class _Network(_Resource):
    def people(self, **page: Any) -> Result: return self._get("/network/people", **page)
    def companies(self, **page: Any) -> Result: return self._get("/network/companies", **page)
    def connection(self, person_id: str) -> Result: return self._get(f"/network/connection/{_q(person_id)}")
    def members(self) -> Result: return self._get("/network/members")


class _Account(_Resource):
    def credits(self) -> Result: return self._get("/organization/credits")
    def usage(self, days: int = 30) -> Result: return self._get("/organization/usage", days=days)
    def me(self) -> Result: return self._get("/me")


class _Webhooks(_Resource):
    def list(self) -> Result: return self._get("/webhooks")
    def create(self, url: str, events: List[str]) -> Result: return self._post("/webhooks", {"url": url, "events": events})
    def delete(self, webhook_id: str) -> Result: return self._c.request("DELETE", f"/webhooks/{_q(webhook_id)}")
    def test(self, webhook_id: str) -> Result: return self._post(f"/webhooks/{_q(webhook_id)}/test", None)
