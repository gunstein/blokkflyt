import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import state
from config import ALLOWED_ORIGINS, LOG_LEVEL, VERSION
from feeds import sample_news, sample_price, sample_sparkline
from stats import sample_stats
from ws import websocket_handler
from zmq_listeners import listen_blocks, listen_txs, flush_tx_buffer

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)


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
        "version":         VERSION,
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
    await websocket_handler(ws)
