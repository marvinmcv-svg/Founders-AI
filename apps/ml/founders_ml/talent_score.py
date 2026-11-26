"""Talent-score trainer (plan 9.3): calibrate the 1–10 score against later fundraising outcomes.

    uv run python -m founders_ml.talent_score            # report only
    uv run python -m founders_ml.talent_score --write    # replace the prior weights if the fit is better

Label: a founder's company announced a priced round within 24 months of its founding year.
Features mirror `featureVector` in packages/core/src/signals/talent.ts exactly (same names, same scaling),
so the exported weights drop straight into the TypeScript scorer. The fitted model replaces the expert
priors only when it beats them on held-out AUC by ≥ 0.02 and reaches AUC ≥ 0.6.
"""

from __future__ import annotations

import json
import math
import sys
from datetime import UTC, datetime

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

from .db import ROOT, connect, frame

MODEL_PATH = ROOT / "packages/core/src/signals/talent-model.json"
FEATURES = ["prior_exit", "prior_ipo", "serial_founder", "major_employer", "top_university", "seniority", "log_years", "connections_pct",
            "type_new_company", "type_out_of_stealth", "type_departure", "type_searching", "type_promotion", "recency"]


def load(conn):
    df = frame(conn, """
      WITH r AS (SELECT id, cume_dist() OVER (ORDER BY connections NULLS FIRST) AS conn_pct FROM people)
      SELECT p.id, p.highlights, p.years_experience, r.conn_pct, c.founded_year,
        EXISTS (SELECT 1 FROM funding_rounds fr WHERE fr.company_id = c.id AND fr.post_money_usd > 0
                AND fr.announced_date < make_date(c.founded_year + 2, 1, 1)) AS raised
      FROM company_people cp JOIN people p ON p.id = cp.person_id JOIN companies c ON c.id = cp.company_id JOIN r ON r.id = p.id
      WHERE cp.is_founder AND c.founded_year <= extract(year FROM now())::int - 2""")
    hl = df["highlights"].apply(lambda xs: set(xs or []))
    x = np.column_stack([
        hl.apply(lambda s: "Prior Exit" in s), hl.apply(lambda s: "Prior IPO" in s), hl.apply(lambda s: "Serial Founder" in s),
        hl.apply(lambda s: "Major Tech Experience" in s), hl.apply(lambda s: "Top University" in s),
        np.ones(len(df)),  # founders: seniority rank 7/7
        np.log1p(df["years_experience"].fillna(0).clip(lower=0)) / math.log1p(40),
        df["conn_pct"].astype(float).clip(0, 1),
        np.ones(len(df)), np.zeros(len(df)), np.zeros(len(df)), np.zeros(len(df)), np.zeros(len(df)),  # NEW_COMPANY
        np.ones(len(df)),  # recency at signal time
    ]).astype(float)
    return x, df["raised"].astype(int).to_numpy()


def main(argv: list[str]) -> None:
    conn = connect()
    x, y = load(conn)
    priors = json.loads(MODEL_PATH.read_text())
    w = np.array([priors["weights"].get(f, 0.0) for f in FEATURES])
    xtr, xte, ytr, yte = train_test_split(x, y, test_size=0.3, random_state=7, stratify=y)
    fit = LogisticRegression(C=1.0, max_iter=2000).fit(xtr, ytr)
    auc_fit = float(roc_auc_score(yte, fit.decision_function(xte)))
    auc_prior = float(roc_auc_score(yte, xte @ w + priors["intercept"]))
    report = {"n": int(len(y)), "positive_rate": round(float(y.mean()), 3), "auc_fitted": round(auc_fit, 3), "auc_priors": round(auc_prior, 3),
              "label": "priced round within 24 months of founding", "evaluated_at": datetime.now(UTC).isoformat()}
    better = auc_fit >= 0.6 and auc_fit >= auc_prior + 0.02
    report["decision"] = "replace priors with fitted weights" if better else "keep priors (fitted model not better on held-out AUC)"
    print(json.dumps(report, indent=2))
    version = priors["version"]
    if better and "--write" in argv:
        version = f"talent-score-v1-fit-{datetime.now(UTC).strftime('%Y%m%d')}"
        coef = dict(zip(FEATURES, fit.coef_[0].round(4).tolist(), strict=True))
        # Constant-in-training features (seniority, type one-hots, recency) keep their prior weights.
        for f in ["seniority", "type_new_company", "type_out_of_stealth", "type_departure", "type_searching", "type_promotion", "recency"]:
            coef[f] = priors["weights"][f]
        MODEL_PATH.write_text(json.dumps({"version": version, "calibration": f"Logistic regression on founder fundraising outcomes; {report}",
                                          "intercept": round(float(fit.intercept_[0]), 4), "weights": coef}, indent=2) + "\n")
        print(f"wrote {MODEL_PATH}")
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("""INSERT INTO model_versions (version, kind, active, metrics) VALUES (%s, 'TALENT_SCORE', true, %s)
                       ON CONFLICT (version) DO UPDATE SET metrics = EXCLUDED.metrics, active = true""", (version, json.dumps(report)))
    conn.close()


if __name__ == "__main__":
    main(sys.argv)
