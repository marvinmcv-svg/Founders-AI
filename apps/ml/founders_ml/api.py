"""ML service (plan 0A: FastAPI). Read-only over the estimates the batch job wrote, plus job triggers.

    uv run uvicorn founders_ml.api:app --port 8100

Batch re-rating is monthly + on new anchors (plan 9.8): POST /jobs/estimates runs the same code as the CLI.
Protected by ML_SERVICE_TOKEN (Bearer) when set; bind to a private network in production.
"""

from __future__ import annotations

import os
import threading

from fastapi import Depends, FastAPI, Header, HTTPException

from .db import connect, frame

app = FastAPI(title="Founders AI ML service", version="0.1.0")
_job_lock = threading.Lock()


def auth(authorization: str | None = Header(default=None)) -> None:
    token = os.environ.get("ML_SERVICE_TOKEN")
    if token and authorization != f"Bearer {token}":
        raise HTTPException(status_code=401, detail="invalid token")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/models", dependencies=[Depends(auth)])
def models() -> list[dict]:
    with connect() as conn:
        df = frame(conn, "SELECT version, kind, active, metrics, created_at FROM model_versions ORDER BY kind, created_at DESC")
    return df.assign(created_at=df["created_at"].astype(str)).to_dict(orient="records")


@app.get("/estimates/{company_id}", dependencies=[Depends(auth)])
def estimates(company_id: str) -> dict:
    with connect() as conn:
        df = frame(
            conn,
            """SELECT e.month::text AS month, revenue_p10, revenue_p50, revenue_p90, valuation_p10, valuation_p50, valuation_p90, confidence, drivers, e.model_version
               FROM company_estimates e JOIN model_versions mv ON mv.version = e.model_version AND mv.kind = 'REVENUE' AND mv.active
               WHERE e.company_id = %s ORDER BY month""",
            (company_id,),
        )
    if df.empty:
        raise HTTPException(status_code=404, detail="no estimates for company under the active model")
    return {"company_id": company_id, "model_version": df["model_version"].iloc[0], "months": df.drop(columns=["model_version"]).to_dict(orient="records")}


@app.post("/jobs/estimates", dependencies=[Depends(auth)], status_code=202)
def run_estimates() -> dict:
    if not _job_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="an estimates job is already running")

    def work() -> None:
        from .estimates import run

        try:
            run(write=True)
        finally:
            _job_lock.release()

    threading.Thread(target=work, daemon=True).start()
    return {"started": True}
