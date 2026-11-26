import math

import numpy as np

from founders_ml.anchors import MIN_BAND, confidence, honour_anchors

START = math.log(1e6)


def model(n=12, start=START, growth=0.02, half=0.6):
    p50 = np.array([start + growth * i for i in range(n)])
    return p50 - half, p50, p50 + half


def test_no_anchor_returns_model():
    lo, mid, hi = model()
    h = honour_anchors(lo, mid, hi, {})
    assert np.allclose(h.p50, mid) and np.isinf(h.distance).all()


def test_anchor_month_equals_disclosure_and_band_collapses():
    lo, mid, hi = model()
    anchor = math.log(2.5e6)
    h = honour_anchors(lo, mid, hi, {5: anchor})
    assert math.isclose(h.p50[5], anchor)
    assert math.isclose(h.p90[5] - h.p50[5], 0.6 * MIN_BAND, rel_tol=1e-9)
    # band widens with distance from the anchor
    widths = h.p90 - h.p10
    assert widths[5] < widths[7] < widths[11]
    assert h.distance[8] == 3


def test_anchor_carries_model_growth_and_decays_to_model():
    lo, mid, hi = model(n=60)
    anchor = mid[0] + 1.0  # disclosure is e^1 ≈ 2.7x the model
    h = honour_anchors(lo, mid, hi, {0: anchor})
    assert h.p50[1] - h.p50[0] < 0.02 + 1e-9  # model growth, pulled back toward the model
    assert abs(h.p50[59] - mid[59]) < 0.01  # far from the anchor the model wins


def test_interpolates_between_two_anchors_in_log_space():
    lo, mid, hi = model(growth=0.0)
    h = honour_anchors(lo, mid, hi, {2: math.log(1e6), 8: math.log(4e6)})
    assert math.isclose(h.p50[2], math.log(1e6)) and math.isclose(h.p50[8], math.log(4e6))
    assert math.log(1e6) < h.p50[5] < math.log(4e6)


def test_prior_anchor_outside_window():
    lo, mid, hi = model()
    h = honour_anchors(lo, mid, hi, {}, tau=12, prior=(mid[0] + 0.5, 3))
    assert h.p50[0] > mid[0] and h.distance[0] == 3 and h.distance[4] == 7


def test_confidence_tiers():
    assert confidence(math.log(1e6), math.log(1.4e6), 20, 0) == "HIGH"
    assert confidence(math.log(1e6), math.log(5e6), 6, 1) == "MEDIUM"
    assert confidence(math.log(1e6), math.log(5e6), math.inf, 0) == "LOW"
    assert confidence(math.log(1e6), math.log(9e6), 30, 3) == "HIGH"
