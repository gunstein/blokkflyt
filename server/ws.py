import asyncio
import json

import state

SEND_TIMEOUT = 5.0  # seconds; slow clients are disconnected


async def broadcast(event: dict) -> None:
    if not state.clients:
        return
    data = json.dumps(event)  # serialize once for all clients
    clients = list(state.clients)
    results = await asyncio.gather(
        *[asyncio.wait_for(ws.send_text(data), timeout=SEND_TIMEOUT) for ws in clients],
        return_exceptions=True,
    )
    for ws, result in zip(clients, results):
        if isinstance(result, Exception):
            if ws in state.clients:
                state.clients.remove(ws)
