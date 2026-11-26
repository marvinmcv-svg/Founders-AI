"""Postgres access. Reads DATABASE_URL from the repo-root .env (same as the TS packages)."""

from __future__ import annotations

import os
from pathlib import Path

import pandas as pd
import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / ".env")


def connect() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/founders")
    local = any(h in url for h in ("@localhost", "@127.0.0.1", "@postgres"))
    # autocommit: `with conn.transaction()` blocks are then real transactions (not savepoints in an open one).
    return psycopg.connect(url, autocommit=True, sslmode="disable" if local else "require", prepare_threshold=None if ":6543" in url else 5)


def frame(conn: psycopg.Connection, query: str, params: tuple | None = None) -> pd.DataFrame:
    with conn.cursor() as cur:
        cur.execute(query, params)
        cols = [d.name for d in cur.description or []]
        return pd.DataFrame(cur.fetchall(), columns=cols)
