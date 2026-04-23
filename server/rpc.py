import asyncio

from bitcoinrpc.authproxy import AuthServiceProxy

from config import BITCOIN_HOST, BITCOIN_RPC_USER, BITCOIN_RPC_PASSWORD, BITCOIN_RPC_PORT


def rpc() -> AuthServiceProxy:
    return AuthServiceProxy(
        f"http://{BITCOIN_RPC_USER}:{BITCOIN_RPC_PASSWORD}@{BITCOIN_HOST}:{BITCOIN_RPC_PORT}"
    )


async def get_tx_info(txid: str) -> dict:
    try:
        entry    = await asyncio.to_thread(lambda: rpc().getmempoolentry(txid))
        fees     = entry.get("fees", {})
        vsize    = entry.get("vsize", 1)
        fee_sat  = int(float(fees.get("base", 0)) * 1e8)
        fee_rate = round(fee_sat / vsize, 2)
    except Exception:
        return {"fee_rate": None, "vsize": None, "amount_btc": None}

    try:
        raw        = await asyncio.to_thread(lambda: rpc().getrawtransaction(txid, True))
        amount_btc = round(sum(float(o["value"]) for o in raw.get("vout", [])), 8)
    except Exception:
        amount_btc = None

    return {"fee_rate": fee_rate, "vsize": vsize, "amount_btc": amount_btc}


async def get_block_info(block_hash: str) -> dict:
    try:
        block           = await asyncio.to_thread(lambda: rpc().getblock(block_hash, 2))
        txs             = block.get("tx", [])
        confirmed_txids = [tx["txid"] for tx in txs]
        ntx             = block.get("nTx", 0)
        size_kb         = round(block.get("size", 0) / 1024, 1)
        total_btc       = sum(
            float(vout["value"])
            for tx in txs[1:]  # skip coinbase
            for vout in tx.get("vout", [])
        )
        fee_rates = sorted(
            round(float(tx["fee"]) * 1e8 / max(int(tx.get("vsize", 1)), 1), 1)
            for tx in txs[1:]
            if "fee" in tx
        )
        median_fee = fee_rates[len(fee_rates) // 2] if fee_rates else None
        return {
            "confirmed_txids": confirmed_txids,
            "ntx":        ntx,
            "size_kb":    size_kb,
            "total_btc":  round(total_btc, 2),
            "median_fee": median_fee,
            "height":     block.get("height", 0),
            "time":       block.get("time", 0),
        }
    except Exception:
        return {"confirmed_txids": [], "ntx": 0, "size_kb": 0, "total_btc": 0, "median_fee": None, "height": 0, "time": 0}
