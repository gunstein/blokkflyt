from collections import deque

mempool: dict[str, dict] = {}
clients: list = []
mempool_tx_samples: deque[int] = deque(maxlen=20)
mempool_activity: dict = {"status": "calibrating", "deviation_pct": None, "baseline": None}
cached_stats: dict | None = None
cached_news: list[dict] = []
cached_price: dict | None = None
cached_sparkline: list[float] = []
recent_blocks: deque[dict] = deque(maxlen=20)
last_block_time: int = 0
tx_buffer: list[dict] = []
