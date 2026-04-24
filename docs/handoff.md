# Handoff

This document tracks the current working state of the project.

It must be updated after each meaningful change.

---

## 🟢 Current state

Full end-to-end flow with rich visualization:
**Bitcoin Core → ZMQ → FastAPI → WebSocket → PixiJS canvas in browser**

### Server modules

| File                 | Responsibility                                        |
|----------------------|-------------------------------------------------------|
| `state.py`           | Global mutable state: mempool, clients, caches, tx_buffer |
| `config.py`          | Env vars + defaults (`BITCOIN_RPC_HOST` defaults to `localhost`) |
| `rpc.py`             | Bitcoin Core RPC client, `get_tx_info`, `get_block_info` |
| `stats.py`           | Fee histogram, supply, activity, difficulty adj, `_refresh_stats`, `sample_stats` |
| `feeds.py`           | Price, sparkline, news background tasks               |
| `zmq_listeners.py`   | ZMQ tx/block listeners, `flush_tx_buffer`             |
| `ws.py`              | `broadcast()` — serializes once, 5s send timeout      |
| `main.py`            | FastAPI app, routes, WebSocket endpoint (75 lines)    |

Key behaviours:
- Incoming txs are buffered in `state.tx_buffer`; `flush_tx_buffer` drains every 200ms as a single `tx_batch` — reduces JSON serialization from N×M to 1 per flush interval
- `broadcast()` serializes the event to JSON once, then sends the same string to all clients in parallel via `asyncio.gather`. Clients that take >5s to receive are disconnected (they reconnect and get a fresh snapshot)
- `listen_blocks` has a 5-minute `asyncio.wait_for` timeout: on timeout it checks node height via RPC and fetches any missed block before reconnecting
- `block_seen` includes `prev_block_time` tracked via `state.last_block_time`
- `_refresh_stats` splits RPC calls into core (must succeed) and optional (fail gracefully)
- Difficulty adjustment estimate computed from epoch start block header
- WebSocket on connect sends: last 20 `block_seen` events, `stats_update`, `price_update`, `sparkline_update`, `news_update`
- WebSocket broadcasts: `tx_batch`, `block_seen`, `stats_update`, `price_update`, `sparkline_update`, `news_update`
- `stats_update` includes `client_count` and `oldest_mempool_sec`
- `block_seen` includes `median_fee` (median sat/vB of confirmed txs)
- WS connection limits: max 100 total, max 20 per IP (accept → close pattern)
- All numeric values cast to `int()`/`float()` before broadcast to prevent Decimal serialization errors

### Client (`client/src/main.ts` + `client/src/utils.ts`)
- Pure functions (visual encoding, time formatting) extracted to `utils.ts`
- Transaction nodes rendered as circles:
  - **Color** = state: purple=new, blue=mempool, orange=high fee (≥10 sat/vB), yellow=selected
  - **High fee nodes** get a blue stroke to show they are also in mempool
  - **Size** = BTC amount (larger circle = more bitcoin)
  - **Alpha/brightness** = vsize (dimmer = more complex/heavy transaction)
  - **₿ icon** shown on transactions with ≥1 BTC
- Rolling window of 500 nodes — oldest removed when full
- Ring center offset: 40px above screen center on desktop, 67% down on mobile (≤640px)
- **Three concentric rings** (all scale from `ringRadius() = min(cx,cy) * 0.72`):
  - **Mempool ring** (`ringRadius()`) — transactions orbit outward to this boundary
  - **Mining arc ring** (`ringRadius() + 36`) — clock showing time elapsed since last block
  - **Confirmed blocks ring** (`ringRadius() + 68`) — last 20 blocks evenly spaced
- **Mining arc** (inner ring):
  - Grows in real time from last block's clock position toward current time
  - Grey (0–45 min) → orange (45–55 min) → red (55–60 min)
  - Disappears after 60 min — no display for unusually long blocks
  - Quarter-hour tick marks at 0, 15, 30, 45 min
- **Clock hands** centered on canvas, animated per frame (60fps):
  - Hour hand: 52% of ring radius, width 4px, alpha 0.7
  - Minute hand: 75% of ring radius, width 2.5px, alpha 0.6
  - Second hand: 85% of ring radius, width 1.5px, alpha 0.5
  - Clock nål on mining arc ring shows exact current position
- **Confirmed blocks** (outer ring):
  - Last 20 blocks, evenly spaced with 65% arc width + 35% gap
  - Stroke width = `blockStrokeWidth(ntx)` — ranges 2–18px based on tx count
  - Color gradient: newest = bright yellow, oldest = dark orange
  - Alpha: exponential decay from newest (1.0) to oldest (≥0.25)
  - Tooltip on hover: block height, tx count, size, total BTC
- On block: confirmed transactions animate toward the new segment position
- HUD overlay (left): BTC price + sparkline, block height, last block age, mempool stats, peers, network (hashrate, difficulty, **next adjustment + est. % change**), activity
- HUD overlay (right): fee rate bar, fee histogram, recommended fees, supply + halving, latest block details
- Tooltip on hover: shows txid, fee rate, amount, vsize (tx) or block stats (block)
- Stats updated via `stats_update` WebSocket message — no polling
- `fetchStats()` used for initial load only
- News ticker: rotating Bitcoin Magazine headlines, one every 8s with fade + publication age
- **Responsive layout:** on mobile (≤640px) HUDs narrow to 145px, less essential blocks hidden, legend hidden, circle shifted lower
- **Connection status:** red "Reconnecting…" banner shown at top when WebSocket is disconnected; hidden on reconnect
- Split into modules: `types.ts` (interfaces), `hud.ts` (DOM/HUD), `utils.ts` (pure functions), `main.ts` (PixiJS + network)

### Tests
- `client/src/utils.test.ts` — 26 vitest tests covering visual encoding thresholds (`npm test`)
- `server/test_main.py` — 17 pytest tests covering `_median_fee_rate`, `_compute_activity`, `_compute_supply` (`python3 -m pytest test_main.py -v`)

---

## ✅ Last completed

- **Security hardening:** WS connection limits (100 total, 20/IP), `/snapshot` removed, WS rejection after `accept()`, deps pinned to exact versions
- **Mobile HUD toggle:** HUDs hidden by default on mobile (≤640px); ≡ button bottom-right opens both HUDs as scrollable overlay; tap backdrop to close
- **Wake lock button:** ◎ button bottom-left on desktop keeps screen awake via Wake Lock API (hidden on mobile)
- **Browser context menu suppressed** on long press over canvas (`contextmenu` preventDefault + CSS)
- **PixiJS deprecation fix:** `TxNode` uses `Container` for position/events and child `Graphics` for drawing — removes `Graphics.addChild` deprecation warning
- **Server split into modules:** `state`, `config`, `rpc`, `stats`, `feeds`, `zmq_listeners`, `ws`, `main` — `main.py` now ~75 lines
- **Mempool oldest tx age:** `entry_time` tracked on each tx at ZMQ receive; `oldest_mempool_sec` computed in `_refresh_stats` and shown in Mempool HUD block
- **Per-block median fee rate:** computed from `getblock` verbosity-2 data in `get_block_info`; shown in block segment tooltip
- **Parallel broadcast:** `broadcast()` uses `asyncio.gather` — all clients receive simultaneously, slow clients don't block others
- **Connected viewer count:** `client_count` included in `stats_update`; shown as "Viewers" row in Peers HUD block
- **TX batching:** incoming txs buffered in `state.tx_buffer`, flushed every 200ms as a single `tx_batch` event — reduces JSON serialization from N×M to 1 per interval
- **Pre-serialization in broadcast:** `json.dumps()` once, `send_text()` to each client — same payload string shared across all connections
- **Send timeout:** clients that take >5s to receive are disconnected; they reconnect and get a fresh snapshot
- **`BITCOIN_RPC_HOST` default changed** from hardcoded `192.168.0.104` to `localhost`
- **README rewritten:** quick start, prerequisites, env var table, Bitcoin Core config, test instructions, module table, full WebSocket event contracts
- **Clock ring architecture:** two rings outside mempool ring
  - Inner ring: growing arc showing real-time mining progress (grey→orange→red over 60 min)
  - Outer ring: last 20 confirmed blocks evenly spaced, thickness by tx count
- **Clock hands** (hour/minute/second) centered on canvas, animated per frame
- **Difficulty adjustment** in Network HUD panel: blocks until next adjustment + estimated % change
- **ZMQ block timeout:** 5-min `asyncio.wait_for` + RPC fallback to detect missed blocks
- Client split into modules: `types.ts`, `hud.ts`, `utils.ts`, `main.ts`
- `GET /health` endpoint on server
- `_refresh_stats` resilience: optional RPC calls fail gracefully
- Responsive layout for mobile (≤640px)
- BTC price (real-time + 7-day sparkline), supply + halving, fee histogram, recommended fees
- Bitcoin Magazine news ticker via server-side RSS
- Stats pushed via WebSocket instead of client polling
- Unit tests for all pure functions on client and server

---

## 🔧 In progress

Nothing.

---

## 🚀 Deploy

Managed via the central `reverseproxy` repo (same server as Pinball2DMulti).
Containerfiles are in `server/Containerfile` and `client/Containerfile`.

### 1. Add to `reverseproxy/docker-compose.yml`

```yaml
  blokkflyt_web:
    container_name: blokkflyt_web
    build:
      context: ../source/blokkflyt/client
      dockerfile: Containerfile
    image: localhost/blokkflyt_web:local
    restart: unless-stopped
    expose:
      - "80"
    networks:
      - web

  blokkflyt_server:
    container_name: blokkflyt_server
    build:
      context: ../source/blokkflyt/server
      dockerfile: Containerfile
    image: localhost/blokkflyt_server:local
    restart: unless-stopped
    expose:
      - "8000"
    environment:
      - BITCOIN_RPC_HOST=192.168.0.104
      - BITCOIN_RPC_USER=${BITCOIN_RPC_USER}
      - BITCOIN_RPC_PASSWORD=${BITCOIN_RPC_PASSWORD}
      - BITCOIN_RPC_PORT=8332
      - ALLOWED_ORIGINS=https://blokkflyt.vatnar.no
    networks:
      - web
```

### 2. Add to `reverseproxy/traefik-config/dynamic.yml` — routers

```yaml
    blokkflyt_web_router:
      rule: "Host(`blokkflyt.vatnar.no`) && !(PathPrefix(`/ws`) || PathPrefix(`/snapshot`) || PathPrefix(`/stats`) || PathPrefix(`/health`))"
      priority: 10
      entryPoints: ["websecure"]
      service: blokkflyt_web_service
      tls:
        certResolver: myresolver
      middlewares: ["default-chain", "blokkflyt-csp"]

    blokkflyt_api_router:
      rule: "Host(`blokkflyt.vatnar.no`) && (PathPrefix(`/ws`) || PathPrefix(`/snapshot`) || PathPrefix(`/stats`) || PathPrefix(`/health`))"
      priority: 20
      entryPoints: ["websecure"]
      service: blokkflyt_api_service
      tls:
        certResolver: myresolver
      middlewares: ["ws-protect-chain"]
```

### 3. Add to `reverseproxy/traefik-config/dynamic.yml` — services

```yaml
    blokkflyt_web_service:
      loadBalancer:
        servers:
          - url: "http://blokkflyt_web:80"

    blokkflyt_api_service:
      loadBalancer:
        servers:
          - url: "http://blokkflyt_server:8000"
```

### 4. Add to `reverseproxy/traefik-config/dynamic.yml` — middleware

```yaml
    blokkflyt-csp:
      headers:
        contentSecurityPolicy: "default-src 'none'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss:; img-src 'self' data:; font-src 'self'"
```

### 5. Add to `reverseproxy/deploy.sh`

```bash
BLOKKFLYT_REPO_DIR="${SOURCE_DIR}/blokkflyt"
BLOKKFLYT_REPO_URL="https://github.com/gunstein/blokkflyt"

# Pull/clone blokkflyt
if [ -d "${BLOKKFLYT_REPO_DIR}/.git" ]; then
  git -C "${BLOKKFLYT_REPO_DIR}" pull --ff-only
else
  git clone "${BLOKKFLYT_REPO_URL}" "${BLOKKFLYT_REPO_DIR}"
fi
```

And add `blokkflyt_web blokkflyt_server` to the build and up commands.

### 6. Add Bitcoin RPC credentials to `reverseproxy/.env`

See `deploy/.env.example` in this repo.

---

## ▶️ Next recommended step

- More dramatic block animation (glow/flash on new segment)
- Historical data persistence (SQLite) for fee rate trends and congestion history over time
- Multiple RSS sources or configurable feed URL
