import asyncio
import json

import state

SEND_TIMEOUT = 5.0  # seconds; slow clients are disconnected


async def broadcast(event: dict) -> None:
    if not state.clients:
        return
    data = json.dumps(event)  # serialize once for all clients
    disconnected = []
    for ws in state.clients:
        try:
            await asyncio.wait_for(ws.send_text(data), timeout=SEND_TIMEOUT)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        if ws in state.clients:
            state.clients.remove(ws)
