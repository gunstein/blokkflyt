from collections import deque

import state
from stats import _median_fee_rate, _compute_activity, _compute_supply, _fee_histogram


def make_mempool(*fee_rates: float) -> dict:
    return {str(i): {"fee_rate": r} for i, r in enumerate(fee_rates)}


# --- _median_fee_rate ---

def test_median_fee_rate_empty():
    state.mempool = {}
    assert _median_fee_rate() is None


def test_median_fee_rate_single():
    state.mempool = make_mempool(5.0)
    assert _median_fee_rate() == 5.0


def test_median_fee_rate_odd_count():
    state.mempool = make_mempool(1.0, 3.0, 9.0)
    assert _median_fee_rate() == 3.0


def test_median_fee_rate_even_count():
    state.mempool = make_mempool(2.0, 4.0)
    assert _median_fee_rate() == 3.0


def test_median_fee_rate_ignores_none():
    state.mempool = {"a": {"fee_rate": None}, "b": {"fee_rate": 8.0}}
    assert _median_fee_rate() == 8.0


def test_median_fee_rate_all_none():
    state.mempool = {"a": {"fee_rate": None}}
    assert _median_fee_rate() is None


def test_median_fee_rate_unsorted_input():
    state.mempool = make_mempool(9.0, 1.0, 5.0)
    assert _median_fee_rate() == 5.0


# --- _fee_histogram ---

def test_fee_histogram_empty():
    state.mempool = {}
    result = _fee_histogram()
    assert len(result) == 7
    assert all(b["count"] == 0 for b in result)


def test_fee_histogram_buckets():
    state.mempool = make_mempool(1.0, 3.0, 7.0, 15.0, 30.0, 75.0, 200.0)
    result = _fee_histogram()
    counts = [b["count"] for b in result]
    assert counts == [1, 1, 1, 1, 1, 1, 1]


def test_fee_histogram_labels():
    state.mempool = {}
    labels = [b["label"] for b in _fee_histogram()]
    assert labels == ["1-2", "2-5", "5-10", "10-20", "20-50", "50-100", "100+"]


def test_fee_histogram_ignores_none():
    state.mempool = {"a": {"fee_rate": None}, "b": {"fee_rate": 5.0}}
    result = _fee_histogram()
    assert sum(b["count"] for b in result) == 1


# --- _compute_activity ---

def samples(*values: int) -> deque[int]:
    return deque(values, maxlen=20)


def test_activity_calibrating_too_few_samples():
    result = _compute_activity(1000, samples(1000, 1000, 1000))
    assert result["status"] == "calibrating"
    assert result["deviation_pct"] is None


def test_activity_normal():
    s = samples(1000, 1000, 1000, 1000, 1000, 1000)
    result = _compute_activity(1000, s)
    assert result["status"] == "normal"
    assert result["deviation_pct"] == 0


def test_activity_busy():
    s = samples(1000, 1000, 1000, 1000, 1000, 1000)
    result = _compute_activity(1250, s)
    assert result["status"] == "busy"
    assert result["deviation_pct"] == 25


def test_activity_congested():
    s = samples(1000, 1000, 1000, 1000, 1000, 1000)
    result = _compute_activity(1600, s)
    assert result["status"] == "congested"
    assert result["deviation_pct"] == 60


def test_activity_quiet():
    s = samples(1000, 1000, 1000, 1000, 1000, 1000)
    result = _compute_activity(650, s)
    assert result["status"] == "quiet"
    assert result["deviation_pct"] == -35


def test_activity_baseline_excludes_current():
    # baseline is average of all samples except the last
    s = samples(500, 500, 500, 500, 9999)
    result = _compute_activity(500, s)
    assert result["baseline"] == 500


# --- _compute_supply ---

def test_supply_genesis():
    result = _compute_supply(0)
    assert result["circulating_btc"] == 0.0
    assert result["current_subsidy"] == 50.0
    assert result["next_halving_block"] == 210_000


def test_supply_first_halving():
    result = _compute_supply(210_000)
    assert result["circulating_btc"] == 210_000 * 50.0
    assert result["current_subsidy"] == 25.0


def test_supply_percent_mined():
    result = _compute_supply(840_000)
    assert result["percent_mined"] > 93.0


def test_supply_current_era():
    result = _compute_supply(895_000)
    assert result["current_subsidy"] == 3.125
    assert result["next_halving_block"] == 1_050_000


def test_supply_never_exceeds_21m():
    result = _compute_supply(6_930_000)
    assert result["circulating_btc"] <= 21_000_000
