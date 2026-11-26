"""Revenue & valuation estimates v1 (plan 9.6).

    uv run python -m founders_ml.estimates backtest      # grouped CV + cross-conformal calibration report
    uv run python -m founders_ml.estimates run           # train on all anchors, score every company-month, write

Revenue: LightGBM quantile regression (α = 0.1/0.5/0.9) on log revenue, labels = verified disclosures,
features as-of the disclosure month. Bands are conformalised (CQR) to hit ~85% P10–P90 coverage.
Valuation: second model stacked on the revenue estimate + funding history + investor quality + stage +
HQ + age, labels = priced rounds (features strictly before the round). Both re-anchor to their anchors.
Drivers = TreeSHAP contributions (LightGBM pred_contrib) of the valuation P50 model, grouped.
"""

from __future__ import annotations

import io
import json
import math
import sys
from dataclasses import dataclass
from datetime import UTC, datetime

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold

from .anchors import confidence, honour_anchors
from .db import connect, frame
from .features import CATEGORICAL, REVENUE_FEATURES, load_panel

QUANTILES = (0.1, 0.5, 0.9)
TARGET_COVERAGE = 0.85
PARAMS = dict(n_estimators=400, learning_rate=0.04, num_leaves=15, min_child_samples=15, subsample=0.9, subsample_freq=1, colsample_bytree=0.9, verbose=-1)

VALUATION_FEATURES = [
    "log_rev_p50", "log_total_funding", "log_last_round", "months_since_round", "round_count", "tier1_share", "age_years",
    "headcount_growth_3m", "web_growth_3m", "log_employees", "sector_id", "growth_stage", "hq_region", "hq_country",
]
DRIVER_GROUPS = {
    "Est. revenue": ["log_rev_p50"],
    "Funding history": ["log_total_funding", "log_last_round", "months_since_round", "round_count"],
    "Investor quality": ["tier1_share"],
    "Growth stage": ["growth_stage"],
    "HQ country": ["hq_country", "hq_region"],
    "Company age": ["age_years"],
    "Traction": ["headcount_growth_3m", "web_growth_3m", "log_employees"],
    "Sector": ["sector_id"],
}


def fit_quantiles(x: pd.DataFrame, y: np.ndarray) -> dict[float, lgb.LGBMRegressor]:
    models = {}
    for a in QUANTILES:
        m = lgb.LGBMRegressor(objective="quantile", alpha=a, **PARAMS)
        m.fit(x, y, categorical_feature=[c for c in CATEGORICAL if c in x.columns])
        models[a] = m
    return models


def predict_quantiles(models: dict[float, lgb.LGBMRegressor], x: pd.DataFrame) -> np.ndarray:
    """(n, 3) log predictions, sorted per row so quantiles never cross."""
    p = np.column_stack([models[a].predict(x) for a in QUANTILES])
    return np.sort(p, axis=1)


def conformal_q(p: np.ndarray, y: np.ndarray, target: float = TARGET_COVERAGE) -> float:
    """CQR: the amount (log-space) to widen P10/P90 by so ~`target` of residuals fall inside."""
    e = np.maximum(p[:, 0] - y, y - p[:, 2])
    level = min(1.0, math.ceil((len(e) + 1) * target) / len(e))
    return float(np.quantile(e, level))


@dataclass
class Backtest:
    n: int
    coverage_raw: float
    coverage_calibrated: float
    mape_p50: float
    median_ape_p50: float
    q: float


def revenue_training_set(panel: pd.DataFrame, anchors: pd.DataFrame) -> pd.DataFrame:
    """One row per disclosure, joined to features of the disclosure month (as-of → no leakage)."""
    df = anchors.merge(panel, left_on=["company_id", "period"], right_on=["company_id", "month"], how="inner")
    df["y"] = np.log(df["amount_usd"].astype(float))
    return df


def backtest(x: pd.DataFrame, y: np.ndarray, groups: np.ndarray, folds: int = 5) -> Backtest:
    """Grouped K-fold (a company never sits in train and test) + cross-conformal band calibration."""
    oof = np.zeros((len(x), 3))
    fold_of = np.zeros(len(x), dtype=int)
    for k, (tr, te) in enumerate(GroupKFold(n_splits=folds).split(x, y, groups)):
        oof[te] = predict_quantiles(fit_quantiles(x.iloc[tr], y[tr]), x.iloc[te])
        fold_of[te] = k
    raw = float(np.mean((oof[:, 0] <= y) & (y <= oof[:, 2])))
    # Cross-conformal: each fold's widening is learned from the other folds only (honest coverage).
    covered = np.zeros(len(x), dtype=bool)
    for k in range(folds):
        q = conformal_q(oof[fold_of != k], y[fold_of != k])
        m = fold_of == k
        covered[m] = (oof[m, 0] - q <= y[m]) & (y[m] <= oof[m, 2] + q)
    ape = np.abs(np.exp(oof[:, 1]) - np.exp(y)) / np.exp(y)
    return Backtest(len(x), raw, float(covered.mean()), float(ape.mean()), float(np.median(ape)), conformal_q(oof, y))


def load_anchors(conn) -> tuple[pd.DataFrame, pd.DataFrame]:
    rev = frame(conn, "SELECT company_id, date_trunc('month', period)::date AS period, amount_usd FROM revenue_disclosures WHERE status = 'verified'")
    rev["period"] = pd.to_datetime(rev["period"])
    rounds = frame(conn, "SELECT company_id, date_trunc('month', announced_date)::date AS month, announced_date, post_money_usd FROM funding_rounds WHERE post_money_usd > 0")
    rounds["month"] = pd.to_datetime(rounds["month"])
    rounds["announced_date"] = pd.to_datetime(rounds["announced_date"])
    return rev, rounds


def driver_breakdown(model: lgb.LGBMRegressor, x: pd.DataFrame) -> list[list[dict]]:
    contrib = model.predict(x, pred_contrib=True)  # TreeSHAP: one column per feature + bias
    cols = list(x.columns)
    out = []
    for row in contrib:
        groups = []
        for label, feats in DRIVER_GROUPS.items():
            c = sum(row[cols.index(f)] for f in feats if f in cols)
            groups.append({"label": label, "impact": round(math.exp(c) - 1, 2)})
        groups.sort(key=lambda g: -abs(g["impact"]))
        out.append(groups[:6])
    return out


def run(write: bool = True) -> dict:
    conn = connect()
    t0 = datetime.now(UTC)
    panel = load_panel(conn)
    rev_anchors, rounds = load_anchors(conn)
    train = revenue_training_set(panel, rev_anchors)
    if len(train) < 200:
        raise SystemExit(f"Only {len(train)} verified anchors inside the metrics window; need ≥ 200 to train (plan 9.6 asks for 2,000).")
    bt = backtest(train[REVENUE_FEATURES], train["y"].to_numpy(), train["company_id"].to_numpy())
    print(f"revenue backtest n={bt.n} coverage raw={bt.coverage_raw:.3f} calibrated={bt.coverage_calibrated:.3f} MAPE={bt.mape_p50:.3f} medianAPE={bt.median_ape_p50:.3f}")

    rev_models = fit_quantiles(train[REVENUE_FEATURES], train["y"].to_numpy())
    q = bt.q
    pred = predict_quantiles(rev_models, panel[REVENUE_FEATURES])
    panel["r10"], panel["r50"], panel["r90"] = pred[:, 0] - q, pred[:, 1], pred[:, 2] + q

    # --- Valuation: train on priced rounds inside the panel window, features from the month BEFORE the round.
    panel["log_rev_p50"] = panel["r50"]
    prev = panel.copy()
    prev["month"] = prev["month"] + pd.offsets.MonthBegin(1)
    vt = rounds.merge(prev, on=["company_id", "month"], how="inner")
    vt = vt[vt["round_date"].isna() | (vt["round_date"] < vt["announced_date"])]  # the round itself is not a feature
    vt["y"] = np.log(vt["post_money_usd"].astype(float))
    vx = vt[VALUATION_FEATURES]
    vbt = backtest(vx, vt["y"].to_numpy(), vt["company_id"].to_numpy())
    vq = vbt.q
    print(f"valuation backtest n={vbt.n} coverage raw={vbt.coverage_raw:.3f} calibrated={vbt.coverage_calibrated:.3f} MAPE={vbt.mape_p50:.3f} medianAPE={vbt.median_ape_p50:.3f}")
    val_models = fit_quantiles(vx, vt["y"].to_numpy())
    vp = predict_quantiles(val_models, panel[VALUATION_FEATURES])
    panel["v10"], panel["v50"], panel["v90"] = vp[:, 0] - vq, vp[:, 1], vp[:, 2] + vq

    # --- Anchor honouring per company (revenue: disclosures; valuation: priced rounds).
    months = sorted(panel["month"].unique())
    mpos = {m: i for i, m in enumerate(months)}
    rev_by = {cid: g for cid, g in rev_anchors.groupby("company_id")}
    rounds_in = rounds[rounds["month"].isin(months)]
    val_by = {cid: g for cid, g in rounds_in.groupby("company_id")}
    latest_round = rounds.sort_values("announced_date").groupby("company_id").tail(1).set_index("company_id")
    out_rows = []
    latest_idx = []
    for cid, g in panel.groupby("company_id", sort=False):
        g = g.sort_values("month")
        pos = [mpos[m] for m in g["month"]]
        ra = {mpos[r.period]: math.log(r.amount_usd) for r in rev_by.get(cid, pd.DataFrame()).itertuples() if r.period in mpos}
        rh = honour_anchors(g["r10"].to_numpy(), g["r50"].to_numpy(), g["r90"].to_numpy(), {pos.index(k): v for k, v in ra.items() if k in pos})
        va = {mpos[r.month]: math.log(r.post_money_usd) for r in val_by.get(cid, pd.DataFrame()).itertuples()}
        prior = None
        if cid in latest_round.index:
            lr = latest_round.loc[cid]
            gap = (g["month"].iloc[0] - lr["month"]).days / 30.44
            if gap > 0:  # last priced round is older than the window: carry it in as a prior anchor
                prior = (math.log(lr["post_money_usd"]), gap)
        vh = honour_anchors(g["v10"].to_numpy(), g["v50"].to_numpy(), g["v90"].to_numpy(),
                            {pos.index(k): v for k, v in va.items() if k in pos}, tau=12.0, prior=prior)
        recent = len(ra)
        for i, row in enumerate(g.itertuples()):
            conf = confidence(rh.p10[i], rh.p90[i], float(rh.distance[i]), recent)
            out_rows.append((cid, row.month.date(), rh.p10[i], rh.p50[i], rh.p90[i], vh.p10[i], vh.p50[i], vh.p90[i], conf))
        latest_idx.append(g.index[-1])

    est = pd.DataFrame(out_rows, columns=["company_id", "month", "r10", "r50", "r90", "v10", "v50", "v90", "confidence"])
    latest = panel.loc[latest_idx]
    drivers = dict(zip(latest["company_id"], driver_breakdown(val_models[0.5], latest[VALUATION_FEATURES]), strict=True))
    version = f"v1-lgbm-{t0.strftime('%Y%m%d')}"
    metrics = {
        "revenue": {"n_anchors": bt.n, "p10_p90_coverage_raw": round(bt.coverage_raw, 3), "p10_p90_coverage": round(bt.coverage_calibrated, 3),
                    "mape_p50": round(bt.mape_p50, 3), "median_ape_p50": round(bt.median_ape_p50, 3), "conformal_q": round(q, 3)},
        "valuation": {"n_rounds": vbt.n, "p10_p90_coverage_raw": round(vbt.coverage_raw, 3), "p10_p90_coverage": round(vbt.coverage_calibrated, 3),
                      "mape_p50": round(vbt.mape_p50, 3), "median_ape_p50": round(vbt.median_ape_p50, 3), "conformal_q": round(vq, 3)},
        "features": REVENUE_FEATURES, "valuation_features": VALUATION_FEATURES,
        "leakage_guard": "features as-of the anchor month; valuation features from the month before the round",
        "known_approximations": ["growth_stage is current", "department mix is current"],
        "trained_at": t0.isoformat(), "companies": int(est["company_id"].nunique()), "months": len(months),
    }
    print(json.dumps(metrics["revenue"]), json.dumps(metrics["valuation"]))
    if write:
        write_estimates(conn, est, drivers, version, metrics)
    conn.close()
    return metrics


def write_estimates(conn, est: pd.DataFrame, drivers: dict[str, list[dict]], version: str, metrics: dict) -> None:
    last_month = est["month"].max()
    buf = io.StringIO()
    for r in est.itertuples(index=False):
        d = json.dumps(drivers.get(r.company_id, [])) if r.month == last_month else "null"
        vals = [r.company_id, r.month.isoformat(), *(str(max(1000, round(math.exp(v)))) for v in (r.r10, r.r50, r.r90)), "ARR",
                *(str(max(10_000, round(math.exp(v)))) for v in (r.v10, r.v50, r.v90)), r.confidence, d, version]
        buf.write("\t".join(v.replace("\\", "\\\\").replace("\t", " ") for v in vals) + "\n")
    buf.seek(0)
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("DELETE FROM company_estimates WHERE model_version = %s", (version,))
        with cur.copy("COPY company_estimates (company_id, month, revenue_p10, revenue_p50, revenue_p90, revenue_type, valuation_p10, valuation_p50, "
                      "valuation_p90, confidence, drivers, model_version) FROM STDIN") as cp:
            while chunk := buf.read(1 << 20):
                cp.write(chunk)
        cur.execute("UPDATE model_versions SET active = false WHERE kind = 'REVENUE'")
        cur.execute("""INSERT INTO model_versions (version, kind, active, metrics) VALUES (%s, 'REVENUE', true, %s)
                       ON CONFLICT (version) DO UPDATE SET active = true, metrics = EXCLUDED.metrics""", (version, json.dumps(metrics)))
        cur.execute("""UPDATE companies c SET est_revenue_usd = e.revenue_p50, est_valuation_usd = e.valuation_p50
                       FROM company_estimates e WHERE e.company_id = c.id AND e.model_version = %s AND e.month = %s""", (version, last_month))
        # Keep v0 plus the two most recent v1 versions (rollback = repoint `active`).
        cur.execute("""DELETE FROM company_estimates WHERE model_version IN (
                         SELECT version FROM model_versions WHERE kind = 'REVENUE' AND version LIKE 'v1-%%'
                         ORDER BY created_at DESC OFFSET 2)""")
    print(f"wrote {len(est)} estimate rows as {version} (active)")


def main(argv: list[str]) -> None:
    cmd = argv[1] if len(argv) > 1 else "run"
    if cmd == "backtest":
        run(write=False)
    elif cmd == "run":
        run(write=True)
    else:
        raise SystemExit(f"unknown command {cmd}; use backtest | run")


if __name__ == "__main__":
    main(sys.argv)
