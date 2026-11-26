"""Monthly feature panel (company × month), built strictly as-of each month (leakage guard, plan 9.6).

Time-varying features (headcount, web visits, followers, funding history, investor quality) only use
data dated on or before the month. Static fields (sector, region, country, customer focus, business
models, founded year) do not leak. Known approximations, documented in docs/progress/phase-4.md:
growth stage and department mix are current values.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import psycopg

from .db import frame

CATEGORICAL = ["sector_id", "growth_stage", "hq_region", "hq_country", "customer_focus"]
BUSINESS_MODELS = ["SaaS", "Marketplace", "Product Sales", "Subscription", "Licensing", "Transaction fees", "Advertising", "Services", "Hardware"]

REVENUE_FEATURES = [
    "log_employees", "headcount_growth_3m", "headcount_growth_6m", "log_web_visits", "web_growth_3m", "log_followers",
    "social_growth_3m", "log_total_funding", "log_last_round", "months_since_round", "round_count", "tier1_share",
    "age_years", "eng_share", "sales_share", *[f"bm_{b}" for b in BUSINESS_MODELS], *CATEGORICAL,
]


def load_panel(conn: psycopg.Connection) -> pd.DataFrame:
    metrics = frame(conn, "SELECT company_id, metric, date AS month, value FROM company_metrics_daily")
    metrics["month"] = pd.to_datetime(metrics["month"])
    wide = metrics.pivot_table(index=["company_id", "month"], columns="metric", values="value", aggfunc="last").reset_index()
    wide = wide.sort_values(["company_id", "month"])
    g = wide.groupby("company_id")

    def growth(col: str, k: int) -> pd.Series:
        prev = g[col].shift(k)
        return ((wide[col] - prev) / prev.replace(0, np.nan)).clip(-1, 5)

    wide["headcount_growth_3m"] = growth("employee_count", 3)
    wide["headcount_growth_6m"] = growth("employee_count", 6)
    wide["web_growth_3m"] = growth("web_visits", 3)
    wide["social_growth_3m"] = growth("linkedin_followers", 3)
    wide["log_employees"] = np.log1p(wide["employee_count"].fillna(0))
    wide["log_web_visits"] = np.log1p(wide["web_visits"].fillna(0))
    wide["log_followers"] = np.log1p(wide["linkedin_followers"].fillna(0))

    companies = frame(
        conn,
        """SELECT c.id AS company_id, c.sector_id, c.growth_stage, c.hq_region, c.hq_country, c.customer_focus, c.founded_year,
             c.business_models, c.bootstrapped,
             COALESCE(d.eng, 0) AS eng_share, COALESCE(d.sales, 0) AS sales_share
           FROM companies c LEFT JOIN (
             SELECT current_company_id AS id,
               avg((department = 'Engineering')::int)::float AS eng, avg((department = 'Sales')::int)::float AS sales
             FROM people WHERE current_company_id IS NOT NULL GROUP BY 1) d ON d.id = c.id
           WHERE c.deleted_at IS NULL""",
    )
    for b in BUSINESS_MODELS:
        companies[f"bm_{b}"] = companies["business_models"].apply(lambda xs, b=b: int(b in (xs or [])))
    panel = wide.merge(companies.drop(columns=["business_models"]), on="company_id", how="inner")
    panel["age_years"] = (panel["month"].dt.year - panel["founded_year"].fillna(panel["month"].dt.year)).clip(lower=0)

    rounds = frame(
        conn,
        """SELECT fr.company_id, fr.announced_date AS date, fr.amount_usd AS amount, fr.post_money_usd AS post,
             COALESCE(bool_or('Tier-1' = ANY(i.highlights)), false) AS tier1
           FROM funding_rounds fr LEFT JOIN round_investors ri ON ri.round_id = fr.id LEFT JOIN investors i ON i.id = ri.investor_id
           GROUP BY fr.id""",
    )
    rounds["date"] = pd.to_datetime(rounds["date"])
    panel = add_funding_asof(panel, rounds)
    for c in CATEGORICAL:
        panel[c] = panel[c].astype("category")
    return panel


def add_funding_asof(panel: pd.DataFrame, rounds: pd.DataFrame) -> pd.DataFrame:
    """Cumulative funding features using only rounds announced on or before each month's end."""
    r = rounds.sort_values(["company_id", "date"]).copy()
    r["cum_funding"] = r.groupby("company_id")["amount"].cumsum()
    r["round_count"] = r.groupby("company_id").cumcount() + 1
    r["cum_tier1"] = r.groupby("company_id")["tier1"].cumsum()
    r = r.rename(columns={"date": "round_date"})
    p = panel.copy()
    p["month_end"] = p["month"] + pd.offsets.MonthEnd(0)
    p = p.sort_values("month_end")
    merged = pd.merge_asof(
        p, r.sort_values("round_date")[["company_id", "round_date", "amount", "post", "cum_funding", "round_count", "cum_tier1"]],
        left_on="month_end", right_on="round_date", by="company_id", direction="backward",
    )
    merged["log_total_funding"] = np.log1p(merged["cum_funding"].fillna(0))
    merged["log_last_round"] = np.log1p(merged["amount"].fillna(0))
    merged["last_post_money"] = merged["post"]
    merged["months_since_round"] = ((merged["month_end"] - merged["round_date"]).dt.days / 30.44).fillna(120)
    merged["round_count"] = merged["round_count"].fillna(0)
    merged["tier1_share"] = (merged["cum_tier1"] / merged["round_count"].replace(0, np.nan)).fillna(0)
    return merged.drop(columns=["amount", "post", "cum_funding", "cum_tier1", "month_end"]).sort_values(["company_id", "month"]).reset_index(drop=True)
