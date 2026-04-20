from collections import deque

import main


def make_mempool(*fee_rates: float) -> dict:
    return {str(i): {"fee_rate": r} for i, r in enumerate(fee_rates)}


def test_median_fee_rate_empty():
    main.mempool = {}
    assert main._median_fee_rate() is None


def test_median_fee_rate_single():
    main.mempool = make_mempool(5.0)
    assert main._median_fee_rate() == 5.0


def test_median_fee_rate_odd_count():
    main.mempool = make_mempool(1.0, 3.0, 9.0)
    assert main._median_fee_rate() == 3.0


def test_median_fee_rate_even_count():
    main.mempool = make_mempool(2.0, 4.0)
    assert main._median_fee_rate() == 3.0


def test_median_fee_rate_ignores_none():
    main.mempool = {"a": {"fee_rate": None}, "b": {"fee_rate": 8.0}}
    assert main._median_fee_rate() == 8.0


def test_median_fee_rate_all_none():
    main.mempool = {"a": {"fee_rate": None}}
    assert main._median_fee_rate() is None


def test_median_fee_rate_unsorted_input():
    main.mempool = make_mempool(9.0, 1.0, 5.0)
    assert main._median_fee_rate() == 5.0


# --- _compute_activity ---

def samples(*values: int) -> deque[int]:
    return deque(values, maxlen=20)


def test_activity_calibrating_too_few_samples():
    result = main._compute_activity(1000, samples(1000, 1000, 1000))
    assert result["status"] == "calibrating"
    assert result["deviation_pct"] is None


def test_activity_normal():
    s = samples(1000, 1000, 1000, 1000, 1000, 1000)
    result = main._compute_activity(1000, s)
    assert result["status"] == "normal"
    assert result["deviation_pct"] == 0


def test_activity_busy():
    s = samples(1000, 1000, 1000, 1000, 1000, 1000)
    result = main._compute_activity(1250, s)
    assert result["status"] == "busy"
    assert result["deviation_pct"] == 25


def test_activity_congested():
    s = samples(1000, 1000, 1000, 1000, 1000, 1000)
    result = main._compute_activity(1600, s)
    assert result["status"] == "congested"
    assert result["deviation_pct"] == 60


def test_activity_quiet():
    s = samples(1000, 1000, 1000, 1000, 1000, 1000)
    result = main._compute_activity(650, s)
    assert result["status"] == "quiet"
    assert result["deviation_pct"] == -35


def test_activity_baseline_excludes_current_sample():
    # baseline should be avg of all but last sample
    s = samples(500, 500, 500, 500, 9999)  # last = 9999, should not skew baseline
    result = main._compute_activity(500, s)
    assert result["baseline"] == 500
