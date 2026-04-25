import asyncio
import json
import logging

from fastapi import WebSocket, WebSocketDisconnect

import state

SEND_TIMEOUT = 5.0  # seconds; slow clients are disconnected

logger = logging.getLogger(__name__)


async def broadcast(event: dict) -> None:
    if not state.clients:
        return
    data    = json.dumps(event)  # serialize once for all clients
    clients = list(state.clients)
    results = await asyncio.gather(
        *[asyncio.wait_for(ws.send_text(data), timeout=SEND_TIMEOUT) for ws in clients],
        return_exceptions=True,
    )
    for ws, result in zip(clients, results):
        if isinstance(result, Exception):
            if ws in state.clients:
                state.clients.remove(ws)


async def websocket_handler(ws: WebSocket) -> None:
    client_host = ws.client.host if ws.client else "unknown"
    client_ip   = ws.headers.get("x-forwarded-for", client_host).split(",")[0].strip()

    await ws.accept()

    if len(state.clients) >= state.MAX_WS_CLIENTS:
        await ws.close(1013)
        logger.warning("Rejected %s: server full (%d clients)", client_ip, state.MAX_WS_CLIENTS)
        return
    if state.ip_connections.get(client_ip, 0) >= state.MAX_WS_PER_IP:
        await ws.close(1008)
        logger.warning("Rejected %s: per-IP limit (%d) reached", client_ip, state.MAX_WS_PER_IP)
        return

    state.clients.append(ws)
    state.ip_connections[client_ip] = state.ip_connections.get(client_ip, 0) + 1
    logger.info("Client connected from %s (%d total)", client_ip, len(state.clients))

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
        logger.info("Client disconnected from %s (%d total)", client_ip, len(state.clients))
