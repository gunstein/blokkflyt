import asyncio
from contextlib import asynccontextmanager

import zmq
import zmq.asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

BITCOIN_HOST = "192.168.0.104"
ZMQ_BLOCK_PORT = 28332
ZMQ_TX_PORT = 28333

mempool: dict[str, bool] = {}
clients: list[WebSocket] = []

zmq_ctx = zmq.asyncio.Context()


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
        mempool[txid] = True
        await broadcast({"type": "tx_seen", "txid": txid})


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


@app.get("/snapshot")
async def snapshot() -> JSONResponse:
    return JSONResponse({"mempool": list(mempool.keys())})


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
