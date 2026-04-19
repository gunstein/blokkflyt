import asyncio
import os
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

zmq_ctx = zmq.asyncio.Context()


def rpc() -> AuthServiceProxy:
    return AuthServiceProxy(f"http://{RPC_USER}:{RPC_PASSWORD}@{BITCOIN_HOST}:{RPC_PORT}")


async def get_fee_rate(txid: str) -> float | None:
    try:
        entry = await asyncio.to_thread(lambda: rpc().getmempoolentry(txid))
        fees = entry.get("fees", {})
        vsize = entry.get("vsize", 1)
        fee_sat = int(float(fees.get("base", 0)) * 1e8)
        return round(fee_sat / vsize, 2)
    except Exception as e:
        print(f"[RPC] getmempoolentry {txid[:8]}... failed: {e}")
        return None


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
    sock = zmq_ctx.socket(zmq.SUB)
    sock.connect(f"tcp://{BITCOIN_HOST}:{ZMQ_TX_PORT}")
    sock.setsockopt_string(zmq.SUBSCRIBE, "hashtx")
    print("[ZMQ] Listening for transactions...")
    while True:
        parts = await sock.recv_multipart()
        txid = parts[1].hex()
        fee_rate = await get_fee_rate(txid)
        tx = {"txid": txid, "fee_rate": fee_rate}
        mempool[txid] = tx
        await broadcast({"type": "tx_seen", **tx})


async def listen_blocks() -> None:
    sock = zmq_ctx.socket(zmq.SUB)
    sock.connect(f"tcp://{BITCOIN_HOST}:{ZMQ_BLOCK_PORT}")
    sock.setsockopt_string(zmq.SUBSCRIBE, "hashblock")
    print("[ZMQ] Listening for blocks...")
    while True:
        parts = await sock.recv_multipart()
        block_hash = parts[1].hex()
        mempool.clear()
        await broadcast({"type": "block_seen", "hash": block_hash})


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(listen_txs())
    asyncio.create_task(listen_blocks())
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/snapshot")
async def snapshot() -> JSONResponse:
    return JSONResponse({"mempool": list(mempool.values())})


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
