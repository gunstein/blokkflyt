import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import state
from config import ALLOWED_ORIGINS
from feeds import sample_news, sample_price, sample_sparkline
from stats import sample_stats
from zmq_listeners import listen_blocks, listen_txs, flush_tx_buffer


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(listen_txs())
    asyncio.create_task(listen_blocks())
    asyncio.create_task(flush_tx_buffer())
    asyncio.create_task(sample_stats())
    asyncio.create_task(sample_price())
    asyncio.create_task(sample_sparkline())
    asyncio.create_task(sample_news())
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({
        "status":          "ok",
        "clients":         len(state.clients),
        "mempool_size":    len(state.mempool),
        "stats_available": state.cached_stats is not None,
    })



@app.get("/stats")
async def stats() -> JSONResponse:
    if state.cached_stats is None:
        return JSONResponse({"error": "stats not yet available"}, status_code=503)
    return JSONResponse(state.cached_stats)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    client_ip = ws.headers.get("x-forwarded-for", ws.client.host or "unknown").split(",")[0].strip()

    await ws.accept()

    if len(state.clients) >= state.MAX_WS_CLIENTS:
        await ws.close(1013)
        print(f"[WS] Rejected {client_ip}: server full ({state.MAX_WS_CLIENTS} clients)")
        return
    if state.ip_connections.get(client_ip, 0) >= state.MAX_WS_PER_IP:
        await ws.close(1008)
        print(f"[WS] Rejected {client_ip}: per-IP limit ({state.MAX_WS_PER_IP}) reached")
        return
    state.clients.append(ws)
    state.ip_connections[client_ip] = state.ip_connections.get(client_ip, 0) + 1
    print(f"[WS] Client connected from {client_ip} ({len(state.clients)} total)")

    block_list = list(state.recent_blocks)
    for i, block_event in enumerate(block_list):
        event_copy = dict(block_event)
        if "prev_block_time" not in event_copy:
            event_copy["prev_block_time"] = block_list[i - 1]["time"] if i > 0 else 0
        await ws.send_json(event_copy)

    if state.cached_stats:
        await ws.send_json({"type": "stats_update", **state.cached_stats})
    if state.cached_price:
        await ws.send_json({"type": "price_update", **state.cached_price})
    if state.cached_sparkline:
        await ws.send_json({"type": "sparkline_update", "prices": state.cached_sparkline})
    if state.cached_news:
        await ws.send_json({"type": "news_update", "items": state.cached_news})

    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        if ws in state.clients:
            state.clients.remove(ws)
        state.ip_connections[client_ip] = max(0, state.ip_connections.get(client_ip, 0) - 1)
        print(f"[WS] Client disconnected from {client_ip} ({len(state.clients)} total)")
