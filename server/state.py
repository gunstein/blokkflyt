from __future__ import annotations

from collections import deque
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from fastapi import WebSocket

MAX_WS_CLIENTS    = 100
MAX_WS_PER_IP     = 20

mempool: dict[str, dict[str, Any]] = {}
clients: list[WebSocket] = []
ip_connections: dict[str, int] = {}
mempool_tx_samples: deque[int] = deque(maxlen=20)
mempool_activity: dict[str, Any] = {"status": "calibrating", "deviation_pct": None, "baseline": None}
cached_stats: dict[str, Any] | None = None
cached_news: list[dict[str, Any]] = []
cached_price: dict[str, Any] | None = None
cached_sparkline: list[float] = []
recent_blocks: deque[dict[str, Any]] = deque(maxlen=20)
last_block_time: int = 0
tx_buffer: list[dict[str, Any]] = []
