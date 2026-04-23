import state


async def broadcast(event: dict) -> None:
    disconnected = []
    for ws in state.clients:
        try:
            await ws.send_json(event)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        if ws in state.clients:
            state.clients.remove(ws)
