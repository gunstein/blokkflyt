import asyncio
import os
from collections import deque
from contextlib import asynccontextmanager

import zmq
import zmq.asyncio
from bitcoinrpc.authproxy import AuthServiceProxy
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

BITCOIN_HOST = os.getenv("BITCOIN_RPC_HOST", "192.168.0.104")
RPC_USER = os.getenv("BITCOIN_RPC_USER")
RPC_PASSWORD = os.getenv("BITCOIN_RPC_PASSWORD")
RPC_PORT = os.getenv("BITCOIN_RPC_PORT", "8332")
ZMQ_BLOCK_PORT = 28332
ZMQ_TX_PORT = 28333

mempool: dict[str, dict] = {}
clients: list[WebSocket] = []
mempool_tx_samples: deque[int] = deque(maxlen=20)  # ~10 min at 30s intervals
mempool_activity: dict = {"status": "calibrating", "deviation_pct": None, "baseline": None}
cached_stats: dict | None = None

zmq_ctx = zmq.asyncio.Context()


def rpc() -> AuthServiceProxy:
    return AuthServiceProxy(f"http://{RPC_USER}:{RPC_PASSWORD}@{BITCOIN_HOST}:{RPC_PORT}")


async def get_tx_info(txid: str) -> dict:
    try:
        entry = await asyncio.to_thread(lambda: rpc().getmempoolentry(txid))
        fees = entry.get("fees", {})
        vsize = entry.get("vsize", 1)
        fee_sat = int(float(fees.get("base", 0)) * 1e8)
        fee_rate = round(fee_sat / vsize, 2)
    except Exception:
        return {"fee_rate": None, "vsize": None, "amount_btc": None}

    try:
        raw = await asyncio.to_thread(lambda: rpc().getrawtransaction(txid, True))
        amount_btc = round(sum(float(o["value"]) for o in raw.get("vout", [])), 8)
    except Exception:
        amount_btc = None

    return {"fee_rate": fee_rate, "vsize": vsize, "amount_btc": amount_btc}


def _median_fee_rate() -> float | None:
    rates = [tx["fee_rate"] for tx in mempool.values() if tx.get("fee_rate") is not None]
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
    global cached_stats
    chain_info, mempool_info, network_info = await asyncio.gather(
        asyncio.to_thread(lambda: rpc().getblockchaininfo()),
        asyncio.to_thread(lambda: rpc().getmempoolinfo()),
        asyncio.to_thread(lambda: rpc().getnetworkinfo()),
    )
    best_hash = chain_info.get("bestblockhash", "")
    best_block = await asyncio.to_thread(lambda: rpc().getblockheader(best_hash))
    difficulty = chain_info.get("difficulty", 0)
    hashrate_eh = round(float(str(difficulty)) * (2 ** 32) / 600 / 1e18, 2)

    count = mempool_info.get("size", 0)
    mempool_tx_samples.append(count)
    mempool_activity.update(_compute_activity(count, mempool_tx_samples))

    cached_stats = {
        "block_height": chain_info.get("blocks", 0),
        "best_block_hash": best_hash,
        "best_block_time": best_block.get("time", 0),
        "mempool_tx_count": count,
        "mempool_size_mb": round(mempool_info.get("bytes", 0) / 1e6, 2),
        "mempool_median_fee": _median_fee_rate(),
        "peers": network_info.get("connections", 0),
        "difficulty": round(float(str(difficulty)) / 1e12, 2),
        "hashrate_eh": hashrate_eh,
        "activity": dict(mempool_activity),
    }
    await broadcast({"type": "stats_update", **cached_stats})


async def sample_stats() -> None:
    while True:
        try:
            await _refresh_stats()
        except Exception as e:
            print(f"[STATS] sample failed: {e}")
        await asyncio.sleep(30)


async def broadcast(event: dict) -> None:
    disconnected = []
    for ws in clients:
        try:
            await ws.send_json(event)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        clients.remove(ws)


async def listen_txs() -> None:
    while True:
        try:
            sock = zmq_ctx.socket(zmq.SUB)
            sock.connect(f"tcp://{BITCOIN_HOST}:{ZMQ_TX_PORT}")
            sock.setsockopt_string(zmq.SUBSCRIBE, "hashtx")
            print("[ZMQ] Listening for transactions...")
            while True:
                parts = await sock.recv_multipart()
                txid = parts[1].hex()
                info = await get_tx_info(txid)
                tx = {"txid": txid, **info}
                mempool[txid] = tx
                await broadcast({"type": "tx_seen", **tx})
        except Exception as e:
            print(f"[ZMQ] tx listener crashed: {e}, reconnecting in 5s...")
            await asyncio.sleep(5)


async def get_block_info(block_hash: str) -> dict:
    try:
        block = await asyncio.to_thread(lambda: rpc().getblock(block_hash, 2))
        confirmed_txids = [tx["txid"] for tx in block.get("tx", [])]
        ntx = block.get("nTx", 0)
        size_kb = round(block.get("size", 0) / 1024, 1)
        total_btc = sum(
            float(vout["value"])
            for tx in block.get("tx", [])[1:]  # skip coinbase
            for vout in tx.get("vout", [])
        )
        return {
            "confirmed_txids": confirmed_txids,
            "ntx": ntx,
            "size_kb": size_kb,
            "total_btc": round(total_btc, 2),
            "height": block.get("height", 0),
            "time": block.get("time", 0),
        }
    except Exception:
        return {"confirmed_txids": [], "ntx": 0, "size_kb": 0, "total_btc": 0, "height": 0, "time": 0}


async def listen_blocks() -> None:
    while True:
        try:
            sock = zmq_ctx.socket(zmq.SUB)
            sock.connect(f"tcp://{BITCOIN_HOST}:{ZMQ_BLOCK_PORT}")
            sock.setsockopt_string(zmq.SUBSCRIBE, "hashblock")
            print("[ZMQ] Listening for blocks...")
            while True:
                parts = await sock.recv_multipart()
                block_hash = parts[1].hex()
                info = await get_block_info(block_hash)
                for txid in info["confirmed_txids"]:
                    mempool.pop(txid, None)
                print(f"[BLOCK] ntx={info['ntx']} size={info['size_kb']}KB btc={info['total_btc']}")
                await broadcast({"type": "block_seen", "hash": block_hash, **info})
                try:
                    await _refresh_stats()
                except Exception as e:
                    print(f"[STATS] post-block refresh failed: {e}")
        except Exception as e:
            print(f"[ZMQ] block listener crashed: {e}, reconnecting in 5s...")
            await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(listen_txs())
    asyncio.create_task(listen_blocks())
    asyncio.create_task(sample_stats())
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/snapshot")
async def snapshot() -> JSONResponse:
    return JSONResponse({"mempool": list(mempool.values())})


@app.get("/stats")
async def stats() -> JSONResponse:
    if cached_stats is None:
        return JSONResponse({"error": "stats not yet available"}, status_code=503)
    return JSONResponse(cached_stats)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    clients.append(ws)
    print(f"[WS] Client connected ({len(clients)} total)")
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        clients.remove(ws)
        print(f"[WS] Client disconnected ({len(clients)} total)")
