# Blokkflyt

Real-time visualization of the Bitcoin network.

Transactions appear as particles in a mempool ring, drift outward by fee priority, and animate into confirmed block segments when mined. A clock ring shows how long the current block has been mining.

---

## Quick start

### Prerequisites

- Python 3.11+
- Node.js 18+
- A Bitcoin Core node with RPC and ZMQ enabled (see [Bitcoin Core setup](#bitcoin-core-setup))

### 1. Clone

```bash
git clone https://github.com/gunstein/blokkflyt
cd blokkflyt
```

### 2. Server

```bash
cd server
pip3 install -r requirements.txt --break-system-packages

cp .env.example .env
# Edit .env and fill in your Bitcoin RPC credentials

uvicorn main:app --reload
# Server runs on http://localhost:8000
```

### 3. Client

```bash
cd client
npm install
npm run dev
# Opens at http://localhost:5173
```

The Vite dev server proxies `/ws`, `/snapshot`, `/stats`, `/health` to `localhost:8000` automatically.

---

## Environment variables

Copy `server/.env.example` to `server/.env` and fill in your values.

| Variable              | Default       | Description                              |
|-----------------------|---------------|------------------------------------------|
| `BITCOIN_RPC_HOST`    | `localhost`   | Bitcoin Core node hostname or IP         |
| `BITCOIN_RPC_USER`    | —             | RPC username (required)                  |
| `BITCOIN_RPC_PASSWORD`| —             | RPC password (required)                  |
| `BITCOIN_RPC_PORT`    | `8332`        | RPC port                                 |
| `ZMQ_BLOCK_PORT`      | `28332`       | ZMQ hashblock port                       |
| `ZMQ_TX_PORT`         | `28333`       | ZMQ hashtx port                          |
| `ALLOWED_ORIGINS`     | `http://localhost:5173,http://localhost:5174` | Comma-separated CORS origins |

---

## Bitcoin Core setup

Add to `bitcoin.conf`:

```ini
server=1
rpcuser=your_username
rpcpassword=your_password
rpcallowip=127.0.0.1

zmqpubhashblock=tcp://0.0.0.0:28332
zmqpubhashtx=tcp://0.0.0.0:28333
```

Verify ZMQ is active:

```bash
bitcoin-core.cli getzmqnotifications
```

---

## Running tests

### Server

```bash
cd server
python3 -m pytest test_main.py -v
```

### Client

```bash
cd client
npm test
```

---

## Architecture

```
Bitcoin Core (ZMQ + RPC)
        │
        ▼
server/zmq_listeners.py   ← receives raw block/tx hashes
server/rpc.py             ← fetches details via RPC
server/stats.py           ← computes mempool stats, supply, difficulty
server/feeds.py           ← BTC price (CoinGecko), news (RSS)
server/state.py           ← in-memory shared state
server/main.py            ← FastAPI app, REST + WebSocket endpoints
        │
        ▼ WebSocket + REST
        │
client/src/main.ts        ← PixiJS canvas, animation loop
client/src/hud.ts         ← DOM/HUD updates
client/src/utils.ts       ← pure visual-encoding functions
```

### Server modules

| File                  | Responsibility                                      |
|-----------------------|-----------------------------------------------------|
| `state.py`            | Global mutable state (mempool, clients, caches)     |
| `config.py`           | Environment variables and defaults                  |
| `rpc.py`              | Bitcoin Core RPC client, per-tx and per-block fetch |
| `stats.py`            | Fee histogram, supply, activity, difficulty, refresh |
| `feeds.py`            | Price, sparkline, news background tasks             |
| `zmq_listeners.py`    | ZMQ block and tx listeners with RPC fallback        |
| `ws.py`               | WebSocket broadcast helper                          |
| `main.py`             | FastAPI app, routes, WebSocket endpoint             |

---

## WebSocket events

The server broadcasts these JSON events to all connected clients:

### `tx_batch`
Batch of new transactions that entered the mempool since the last flush (every 200ms).
```json
{ "type": "tx_batch", "txs": [{ "txid": "...", "fee_rate": 12.5, "vsize": 250, "amount_btc": 0.05 }] }
```

### `block_seen`
A new block was mined.
```json
{
  "type": "block_seen",
  "hash": "000000...",
  "height": 946212,
  "ntx": 2843,
  "size_kb": 1521.4,
  "total_btc": 1842.3,
  "median_fee": 12.5,
  "time": 1776876242,
  "prev_block_time": 1776875600,
  "confirmed_txids": ["abc...", "def..."]
}
```

### `stats_update`
Full network stats snapshot. Sent every 30s and immediately after each block.
```json
{
  "type": "stats_update",
  "client_count": 3,
  "oldest_mempool_sec": 8100,
  "block_height": 946212,
  "best_block_hash": "000000...",
  "best_block_time": 1776876242,
  "mempool_tx_count": 11200,
  "mempool_size_mb": 48.2,
  "mempool_median_fee": 8.5,
  "peers": 12,
  "hashrate_eh": 842.3,
  "difficulty": 113757508.4,
  "blocks_until_adj": 412,
  "adj_pct_estimate": -3.2,
  "fee_fast": 15.0,
  "fee_medium": 10.0,
  "fee_slow": 5.0,
  "fee_histogram": [{ "label": "1-2", "count": 420 }, ...],
  "daily_tx_count": 412000,
  "activity": { "status": "normal", "deviation_pct": 5, "baseline": 10800 },
  "supply": {
    "circulating_btc": 19700000.0,
    "percent_mined": 93.8,
    "current_subsidy": 3.125,
    "next_halving_block": 1050000,
    "days_until_halving": 1420
  }
}
```

### `price_update`
```json
{ "type": "price_update", "usd": 97500, "change_24h": 1.8 }
```

### `sparkline_update`
```json
{ "type": "sparkline_update", "prices": [92000, 94000, 96000, ...] }
```

### `news_update`
```json
{
  "type": "news_update",
  "items": [{ "title": "...", "link": "https://...", "pub_ts": 1776800000 }]
}
```

On connect, the server immediately sends up to 20 recent `block_seen` events, then `stats_update`, `price_update`, `sparkline_update`, and `news_update` from cache.

---

## Concept

Blokkflyt presents Bitcoin as a living system:

- New transactions appear in the center and drift outward
- **Color** = state: purple (new) → blue (mempool) → orange (high fee ≥10 sat/vB) → yellow (selected for block)
- **Size** = BTC amount
- **Brightness** = transaction complexity (vsize)
- An inner clock ring grows in real time showing how long the current block has been mining
- An outer ring shows the last 20 confirmed blocks, sized by transaction count
