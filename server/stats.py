import asyncio
import time
from collections import deque

import state
from rpc import rpc
from ws import broadcast

FEE_BUCKETS = [
    (0,    2,   "1-2"),
    (2,    5,   "2-5"),
    (5,   10,   "5-10"),
    (10,  20,   "10-20"),
    (20,  50,   "20-50"),
    (50, 100,   "50-100"),
    (100, None, "100+"),
]


def _fee_histogram() -> list[dict]:
    counts = [0] * len(FEE_BUCKETS)
    for tx in state.mempool.values():
        rate = tx.get("fee_rate")
        if rate is None:
            continue
        for i, (_, high, _) in enumerate(FEE_BUCKETS):
            if high is None or rate < high:
                counts[i] += 1
                break
    return [{"label": label, "count": counts[i]}
            for i, (_, _, label) in enumerate(FEE_BUCKETS)]


def _compute_supply(block_height: int) -> dict:
    HALVING_INTERVAL = 210_000
    MAX_SUPPLY       = 21_000_000.0
    halvings         = block_height // HALVING_INTERVAL
    supply           = sum(HALVING_INTERVAL * (50.0 / 2 ** e) for e in range(halvings))
    supply          += (block_height % HALVING_INTERVAL) * (50.0 / 2 ** halvings)
    next_halving_block = (halvings + 1) * HALVING_INTERVAL
    blocks_until       = next_halving_block - block_height
    return {
        "circulating_btc":   round(supply, 2),
        "percent_mined":     round(supply / MAX_SUPPLY * 100, 4),
        "current_subsidy":   50.0 / 2 ** halvings,
        "next_halving_block": next_halving_block,
        "blocks_until_halving": blocks_until,
        "days_until_halving": round(blocks_until * 10 / 60 / 24),
    }


def _median_fee_rate() -> float | None:
    rates = [tx["fee_rate"] for tx in state.mempool.values() if tx.get("fee_rate") is not None]
    if not rates:
        return None
    rates.sort()
    mid = len(rates) // 2
    return rates[mid] if len(rates) % 2 else round((rates[mid - 1] + rates[mid]) / 2, 2)


def _compute_activity(current: int, samples: deque[int]) -> dict:
    if len(samples) < 5:
        return {"status": "calibrating", "deviation_pct": None, "baseline": None}
    baseline = round(sum(list(samples)[:-1]) / (len(samples) - 1))
    if baseline == 0:
        return {"status": "calibrating", "deviation_pct": None, "baseline": None}
    deviation_pct = round((current - baseline) / baseline * 100)
    if deviation_pct > 50:
        status = "congested"
    elif deviation_pct > 20:
        status = "busy"
    elif deviation_pct < -30:
        status = "quiet"
    else:
        status = "normal"
    return {"status": status, "deviation_pct": deviation_pct, "baseline": baseline}


async def _refresh_stats() -> None:
    # Core — all must succeed
    chain_info, mempool_info, network_info = await asyncio.gather(
        asyncio.to_thread(lambda: rpc().getblockchaininfo()),
        asyncio.to_thread(lambda: rpc().getmempoolinfo()),
        asyncio.to_thread(lambda: rpc().getnetworkinfo()),
    )
    best_hash  = chain_info.get("bestblockhash", "")
    best_block = await asyncio.to_thread(lambda: rpc().getblockheader(best_hash))

    # Optional — failures are logged and skipped gracefully
    try:
        tx_stats = await asyncio.to_thread(lambda: rpc().getchaintxstats(144))
    except Exception as e:
        print(f"[STATS] getchaintxstats failed: {e}")
        tx_stats = {}

    try:
        fee_fast, fee_medium, fee_slow = await asyncio.gather(
            asyncio.to_thread(lambda: rpc().estimatesmartfee(1)),
            asyncio.to_thread(lambda: rpc().estimatesmartfee(3)),
            asyncio.to_thread(lambda: rpc().estimatesmartfee(6)),
        )
    except Exception as e:
        print(f"[STATS] estimatesmartfee failed: {e}")
        fee_fast = fee_medium = fee_slow = {}

    difficulty  = chain_info.get("difficulty", 0)
    hashrate_eh = round(float(str(difficulty)) * (2 ** 32) / 600 / 1e18, 2)

    count = mempool_info.get("size", 0)
    state.mempool_tx_samples.append(count)
    state.mempool_activity.update(_compute_activity(count, state.mempool_tx_samples))

    def to_sat_vb(est: dict) -> float | None:
        rate = est.get("feerate")
        return round(float(rate) * 1e8 / 1000, 1) if rate else None

    entry_times = [tx["entry_time"] for tx in state.mempool.values() if "entry_time" in tx]
    oldest_mempool_sec = int(time.time() - min(entry_times)) if entry_times else None

    state.cached_stats = {
        "client_count":        len(state.clients),
        "oldest_mempool_sec":  oldest_mempool_sec,
        "block_height":        int(chain_info.get("blocks", 0)),
        "best_block_hash":  best_hash,
        "best_block_time":  int(best_block.get("time", 0)),
        "mempool_tx_count": count,
        "mempool_size_mb":  round(int(mempool_info.get("bytes", 0)) / 1e6, 2),
        "mempool_median_fee": _median_fee_rate(),
        "peers":            int(network_info.get("connections", 0)),
        "difficulty":       round(float(str(difficulty)) / 1e12, 2),
        "hashrate_eh":      hashrate_eh,
        "activity":         dict(state.mempool_activity),
        "fee_fast":         to_sat_vb(fee_fast),
        "fee_medium":       to_sat_vb(fee_medium),
        "fee_slow":         to_sat_vb(fee_slow),
        "fee_histogram":    _fee_histogram(),
        "daily_tx_count":   int(tx_stats.get("window_tx_count", 0)),
        "supply":           _compute_supply(int(chain_info.get("blocks", 0))),
    }

    try:
        current_height     = int(chain_info.get("blocks", 0))
        blocks_in_epoch    = current_height % 2016
        epoch_start_height = current_height - blocks_in_epoch
        blocks_until_adj   = 2016 - blocks_in_epoch
        if blocks_in_epoch > 5:
            epoch_hash   = await asyncio.to_thread(lambda: rpc().getblockhash(epoch_start_height))
            epoch_header = await asyncio.to_thread(lambda: rpc().getblockheader(epoch_hash))
            elapsed      = time.time() - epoch_header["time"]
            expected     = blocks_in_epoch * 600
            adj_pct      = round((expected / elapsed - 1) * 100, 1) if elapsed > 0 else None
            if adj_pct is not None:
                adj_pct = max(-75.0, min(300.0, adj_pct))
        else:
            adj_pct = None
        state.cached_stats["blocks_until_adj"] = int(blocks_until_adj)
        state.cached_stats["adj_pct_estimate"] = adj_pct
    except Exception as e:
        print(f"[STATS] difficulty adj failed: {e}")
        state.cached_stats["blocks_until_adj"] = None
        state.cached_stats["adj_pct_estimate"] = None

    await broadcast({"type": "stats_update", **state.cached_stats})


async def sample_stats() -> None:
    while True:
        try:
            await _refresh_stats()
        except Exception as e:
            print(f"[STATS] sample failed: {e}")
        await asyncio.sleep(30)
