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
