"""SDK tests: a local stub server for transport behaviour, plus an optional live run against the
API (set FOUNDERS_AI_TEST_BASE_URL and FOUNDERS_AI_TEST_KEY; CI starts apps/api for this)."""
import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from founders_ai import (  # noqa: E402
    FoundersAI,
    InsufficientCreditsError,
    NotAvailableYetError,
    NotFoundError,
    sign_webhook,
    verify_webhook_signature,
)


class Stub(BaseHTTPRequestHandler):
    calls = []  # type: list
    script = []  # type: list  # (status, body, headers) per call; last one repeats

    def log_message(self, *args):  # silence
        pass

    def _handle(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n) if n else b""
        Stub.calls.append({"method": self.command, "path": self.path, "headers": {k.lower(): v for k, v in self.headers.items()}, "body": body})
        status, payload, headers = Stub.script[min(len(Stub.calls) - 1, len(Stub.script) - 1)]
        raw = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/problem+json" if status >= 400 else "application/json")
        self.send_header("Content-Length", str(len(raw)))
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(raw)

    do_GET = do_POST = do_PATCH = do_DELETE = _handle


class TransportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), Stub)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}/api/v1"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        Stub.calls = []
        self.fa = FoundersAI("fai_test", base_url=self.base, max_retries=2)

    def test_sends_key_and_reads_credit_headers(self):
        Stub.script = [(200, {"id": "com_1"}, {"X-Credits-Charged": "1", "X-Credits-Remaining": "199", "X-Request-Id": "req_1"})]
        r = self.fa.companies.get("com_1")
        self.assertEqual(r["id"], "com_1")
        self.assertEqual((r.credits_charged, r.credits_remaining, r.request_id), (1, 199, "req_1"))
        self.assertEqual(Stub.calls[0]["headers"]["x-api-key"], "fai_test")
        self.assertEqual(Stub.calls[0]["path"], "/api/v1/companies/com_1")

    def test_retries_429_with_retry_after_and_keeps_idempotency_key(self):
        Stub.script = [(429, {"title": "Too Many Requests"}, {"Retry-After": "0"}), (200, {"query_id": "qry_1"}, {})]
        r = self.fa.search.ai("fintech in Brazil")
        self.assertEqual(r["query_id"], "qry_1")
        self.assertEqual(len(Stub.calls), 2)
        keys = {c["headers"]["idempotency-key"] for c in Stub.calls}
        self.assertEqual(len(keys), 1, "a retried POST must reuse its Idempotency-Key")

    def test_maps_problem_json_to_typed_errors(self):
        Stub.script = [(404, {"title": "Not Found", "detail": "No company. Not charged."}, {"X-Request-Id": "req_9"})]
        with self.assertRaises(NotFoundError) as ctx:
            self.fa.companies.get("com_x")
        self.assertIn("Not charged", str(ctx.exception))
        self.assertEqual(ctx.exception.request_id, "req_9")
        Stub.script = [(402, {"title": "Payment Required", "needed": 5, "balance": 1}, {})]
        with self.assertRaises(InsufficientCreditsError) as c2:
            self.fa.search.ai("x y")
        self.assertEqual(c2.exception.problem["needed"], 5)
        Stub.calls = []
        Stub.script = [(501, {"title": "Not Implemented", "available_in": "R3"}, {})]
        with self.assertRaises(NotAvailableYetError):
            self.fa.network.members()
        self.assertEqual(len(Stub.calls), 1, "501 is not retried")

    def test_paginate_follows_cursor(self):
        Stub.script = [(200, {"items": [1, 2], "next_cursor": "c1"}, {}), (200, {"items": [3], "next_cursor": None}, {})]
        self.assertEqual(list(self.fa.paginate(self.fa.signals.talent, limit=2, min_score=7)), [1, 2, 3])
        self.assertIn("cursor=c1", Stub.calls[1]["path"])
        self.assertIn("min_score=7", Stub.calls[0]["path"])


class WebhookTests(unittest.TestCase):
    def test_sign_and_verify(self):
        body = b'{"type":"signal.talent"}'
        h = sign_webhook("whsec_x", body, 1_800_000_000)
        self.assertTrue(verify_webhook_signature("whsec_x", body, h, now=1_800_000_100))
        self.assertFalse(verify_webhook_signature("whsec_x", body + b" ", h, now=1_800_000_100))
        self.assertFalse(verify_webhook_signature("whsec_x", body, h, now=1_800_001_000))
        self.assertFalse(verify_webhook_signature("whsec_x", body, "garbage"))

    def test_matches_server_signature_format(self):
        # Same vector as packages/core/test/webhooks.test.ts (t=1800000000, secret whsec_x, body {"a":1}).
        h = sign_webhook("whsec_x", '{"a":1}', 1_800_000_000)
        self.assertRegex(h, r"^t=1800000000,v1=[0-9a-f]{64}$")


LIVE_BASE = os.environ.get("FOUNDERS_AI_TEST_BASE_URL")
LIVE_KEY = os.environ.get("FOUNDERS_AI_TEST_KEY")


@unittest.skipUnless(LIVE_BASE and LIVE_KEY, "live API not configured")
class LiveTests(unittest.TestCase):
    def setUp(self):
        self.fa = FoundersAI(LIVE_KEY, base_url=LIVE_BASE)

    def test_end_to_end(self):
        me = self.fa.account.me()
        self.assertTrue(me["organization"]["id"].startswith("org_"))
        self.assertIn("read:data", me["scopes"])
        feed = self.fa.signals.talent(limit=3)
        self.assertLessEqual(len(feed["items"]), 3)
        first = feed["items"][0]
        sig = self.fa.signals.talent_signal(first["id"])
        self.assertEqual(sig["id"], first["id"])
        self.assertEqual(sig.credits_charged, 1)
        news = list(self.fa.paginate(self.fa.signals.news, limit=2, max_items=3))
        self.assertEqual(len(news), 3)
        with self.assertRaises(NotFoundError):
            self.fa.companies.get("com_000000000000000000000000")
        with self.assertRaises(NotAvailableYetError):
            self.fa.signals.investor_interest()
        q = self.fa.search.ai("seed stage fintech", limit=2)
        page = self.fa.search.results(q["query_id"], limit=2)
        self.assertEqual(page["product"], q["product"])


if __name__ == "__main__":
    unittest.main()
