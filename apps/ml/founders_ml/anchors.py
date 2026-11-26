"""Anchor honouring and confidence tiers (plan 9.6). Pure functions on log-space arrays.

At a disclosure month P50 equals the disclosed value and the band collapses; between anchors P50
interpolates in log-space (carrying the model-implied growth from each anchor) blended with the
model output; the band widens with distance from the nearest anchor.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

TAU_MONTHS = 9.0  # how fast an anchor's influence decays
MIN_BAND = 0.15  # share of the model band kept at an anchor month


@dataclass(frozen=True)
class Honoured:
    p10: np.ndarray
    p50: np.ndarray
    p90: np.ndarray
    distance: np.ndarray  # months to nearest anchor (inf when none)


def honour_anchors(
    p10: np.ndarray,
    p50: np.ndarray,
    p90: np.ndarray,
    anchors: dict[int, float],
    tau: float = TAU_MONTHS,
    prior: tuple[float, float] | None = None,
) -> Honoured:
    """All arrays are log-values indexed by month position; `anchors` maps month index → log value.

    `prior` = (log value, months before index 0): an anchor older than the window (e.g. the last priced
    round). It is carried forward with the model's growth from index 0 and counts as `gap + t` months away.
    """
    n = len(p50)
    out10, out50, out90 = p10.astype(float).copy(), p50.astype(float).copy(), p90.astype(float).copy()
    dist = np.full(n, np.inf)
    if not anchors and prior is None:
        return Honoured(out10, out50, out90, dist)
    idx = sorted(anchors)
    for t in range(n):
        left = max((a for a in idx if a <= t), default=None)
        right = min((a for a in idx if a >= t), default=None)
        carried: list[tuple[float, float]] = []  # (value, distance)
        for a in {left, right} - {None}:
            assert a is not None
            carried.append((anchors[a] + (p50[t] - p50[a]), abs(t - a)))
        if left is None and prior is not None:
            carried.append((prior[0] + (p50[t] - p50[0]), prior[1] + t))
        if left is not None and right is not None and left != right:
            (v1, d1), (v2, d2) = carried[0], carried[1]
            value = (v1 * d2 + v2 * d1) / (d1 + d2)  # linear interpolation between the two anchors
            d = min(d1, d2)
        else:
            value, d = min(carried, key=lambda x: x[1])
        w = math.exp(-d / tau)
        mid = w * value + (1 - w) * p50[t]
        shrink = MIN_BAND + (1 - MIN_BAND) * (1 - w)
        out10[t] = mid - (p50[t] - p10[t]) * shrink
        out90[t] = mid + (p90[t] - p50[t]) * shrink
        out50[t] = mid
        dist[t] = d
    return Honoured(out10, out50, out90, dist)


def confidence(p10: float, p90: float, anchor_distance: float, recent_anchors: int) -> str:
    """HIGH (≥ 3 recent anchors or tight band), MEDIUM (an anchor within 12 months or a moderate band), LOW."""
    ratio = math.exp(p90 - p10)  # P90/P10 in linear space
    if recent_anchors >= 3 or ratio < 1.6:
        return "HIGH"
    if anchor_distance <= 12 or ratio < 3.0:
        return "MEDIUM"
    return "LOW"
