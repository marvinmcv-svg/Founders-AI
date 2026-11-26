# founders-ai (Python)

Dependency-free client for the Founders AI API (Python 3.9+).

```bash
pip install ./packages/sdk-python
export FOUNDERS_AI_API_KEY=fai_...
```

```python
from founders_ai import FoundersAI, NotFoundError

fa = FoundersAI()  # or FoundersAI(api_key="fai_...", base_url="https://app.example.com/api/v1")

company = fa.companies.get("com_...")
print(company["organization_name"], company.credits_charged, company.credits_remaining)

# Cursor pagination
for signal in fa.paginate(fa.signals.talent, limit=500, signal_date_after="2026-11-01", min_score=8):
    print(signal["summary"])

# Plain-English search, then page through it (query_id is valid for 7 days)
q = fa.search.ai("Series A fintech in Brazil with growing headcount", limit=25)
more = fa.search.results(q["query_id"], cursor=q["next_cursor"])

# Free text → resolved entities (1 credit per entity)
fa.search.extract_entities("Acme Robotics raised a Seed round led by Example Ventures.")
```

- Every result is a `dict` with `credits_charged`, `credits_remaining`, `request_id` attributes.
- 429 responses are retried after `Retry-After`; 5xx/network errors with exponential backoff.
- Every POST carries an `Idempotency-Key`, so a retried request is never charged twice.
- Errors are typed: `AuthenticationError` (401), `InsufficientCreditsError` (402),
  `PermissionDeniedError` (403), `NotFoundError` (404, never charged), `RateLimitError` (429),
  `NotAvailableYetError` (501, endpoints that launch in a later release).

## Webhooks

```python
from founders_ai import verify_webhook_signature

def handle(request):
    raw = request.body  # raw bytes, before JSON parsing
    if not verify_webhook_signature(WEBHOOK_SECRET, raw, request.headers["X-Signature"]):
        return 400
    event = json.loads(raw)  # {"id", "type", "created_at", "data"}
```

Events: `search.new_results`, `list.news`, `signal.talent` (`signal.interest`, `crm.sync` from R3).
Failed deliveries are retried 6 times (1 m, 5 m, 30 m, 2 h, 6 h, 12 h); an endpoint failing for
24 h is disabled.

## Tests

```bash
python3 -m unittest discover -s tests
```
