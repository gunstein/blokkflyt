# Decisions

This document records architectural decisions and the reasoning behind them.

Agents and developers must read this before changing the architecture.

---

## 2026-04-19 — Python + FastAPI for server

**Decision:** Use Python with FastAPI as the server layer.

**Why:** FastAPI has native async support, easy WebSocket handling, and good ZMQ integration via `pyzmq`. Bitcoin tooling (RPC libraries, community examples) is also well-established in Python.

**Alternatives considered:** Node.js — rejected to keep the ZMQ/Bitcoin layer closer to existing Python tooling.

---

## 2026-04-19 — TypeScript + PixiJS for client

**Decision:** Use TypeScript with PixiJS for the frontend.

**Why:** PixiJS is a WebGL-accelerated 2D renderer well-suited for animating hundreds of transaction nodes in real time. TypeScript gives type safety across the event schema boundary.

**Alternatives considered:** Three.js (overkill for 2D), plain Canvas (too low-level), D3 (not optimized for real-time animation at this scale).

---

## 2026-04-19 — REST for snapshot, WebSocket for live updates

**Decision:** On connect, the client fetches the current mempool state via REST, then subscribes to live events over WebSocket.

**Why:** Avoids replaying the full history over WebSocket on reconnect. The snapshot gives an immediate consistent view; the stream keeps it live.

---

## 2026-04-19 — In-memory state on server

**Decision:** Server holds mempool state in memory only — no database.

**Why:** Mempool state is ephemeral and fully reconstructable from Bitcoin Core on restart. A database would add complexity with no benefit.

---

## 2026-04-19 — ZMQ topics: hashtx / hashblock

**Decision:** Subscribe to `hashtx` and `hashblock` ZMQ topics (not `rawtx` / `rawblock`).

**Why:** Hash-only topics are lightweight. The server fetches full transaction/block details via RPC when needed, keeping ZMQ bandwidth low.

---

## 2026-04-20 — Visual encoding: size = BTC amount, brightness = vsize

**Decision:** Circle size encodes BTC amount; alpha/brightness encodes vsize (transaction complexity).

**Why:** BTC amount is the most intuitive size signal — large circles mean large money. Vsize is secondary detail communicated through brightness. High-fee nodes get an additional blue stroke to show they are still in the mempool.

---

## 2026-04-20 — Pure functions extracted to utils.ts

**Decision:** All pure mapping functions (nodeRadius, vsizeAlpha, stateColor, blockStrokeWidth, timeAgo) live in `utils.ts`, not `main.ts`.

**Why:** `main.ts` has top-level side effects (PixiJS init, fetch) that make it impossible to import in a test environment. Extracting pure functions to a side-effect-free module enables unit testing without mocks.

---

## 2026-04-20 — News fetched server-side and distributed via WebSocket

**Decision:** Server fetches Bitcoin Magazine RSS every 15 minutes and broadcasts headlines to all clients via WebSocket. Clients never fetch RSS directly.

**Why:** RSS feeds block CORS from browsers, so server-side fetching is required. Centralising the fetch means all clients share one HTTP request regardless of how many are connected. New clients receive cached headlines immediately on connect.

---

## 2026-04-20 — Stats pushed via WebSocket, not polled

**Decision:** Server broadcasts `stats_update` over WebSocket after each stats refresh. Clients do not poll `/stats` — they only call it once on initial load.

**Why:** With multiple clients each polling every 30s, the server would make N × 4 RPC calls per interval. A single server-side background task does the work once and pushes the result to all clients. Also ensures HUD updates immediately on block arrival rather than waiting up to 30s.

---

## 2026-04-20 — In-memory state is sufficient (no database needed)

**Decision:** Keep all server state in-memory. No SQLite or other persistence.

**Why:** The mempool is ephemeral by nature — it self-clears as blocks are mined, and is naturally bounded by Bitcoin Core's own mempool limits (~30MB worst case). Activity history is 20 integers. On restart, a fresh snapshot is fetched from Bitcoin Core. A database would add complexity with no benefit for the current feature set. Revisit if historical trend analysis is added.

---

## 2026-04-21 — Client split into modules

**Decision:** Split `main.ts` into `types.ts` (shared interfaces), `hud.ts` (DOM/HUD updates), and `main.ts` (PixiJS canvas + network). `utils.ts` was already separate.

**Why:** `main.ts` had grown to ~580 lines mixing PixiJS rendering, DOM manipulation, WebSocket handling, and data formatting. The split creates a clean boundary: `hud.ts` has no PixiJS imports, `main.ts` has no direct DOM manipulation. Each file has a single reason to change.

---

## 2026-04-21 — _refresh_stats: core vs optional RPC calls

**Decision:** `_refresh_stats` splits RPC calls into two tiers: core (chain info, mempool info, network info, best block header — must all succeed) and optional (`getchaintxstats`, `estimatesmartfee` — failures are logged but do not abort the refresh).

**Why:** Previously all 8 RPC calls were gathered together. A single failure in fee estimation or tx stats aborted the entire stats refresh, leaving clients without updates. Core data is always needed; optional data degrades gracefully to `null` in the HUD.

---

## 2026-04-21 — GET /health endpoint

**Decision:** Added `GET /health` returning server status, connected client count, mempool size, and whether `cached_stats` is populated.

**Why:** Without a health endpoint there is no way to quickly verify the server is alive and functional — useful during development and for future deployment monitoring.

---

## 2026-04-21 — Responsive layout: desktop + mobile

**Decision:** Use CSS media queries (≤640px breakpoint) to adapt the HUD layout for mobile. HUDs narrow to 145px, less essential blocks are hidden, the legend is hidden, and the canvas ring center shifts to 67% of screen height.

**Why:** The PixiJS canvas fills the full screen on both platforms. On mobile, the HUDs overlay the top of the canvas, so the ring must be pushed down to remain visible. Hiding non-essential blocks (network hashrate, fee histogram, activity detail) keeps the mobile view readable without a full redesign.

---

## 2026-04-21 — Deploy: Traefik + podman-compose, same pattern as Pinball2DMulti

**Decision:** Use Traefik as reverse proxy with Let's Encrypt TLS, podman-compose for container orchestration. Client and server run as separate containers behind the same Traefik instance.

**Routing:** Traefik routes `/ws`, `/snapshot`, `/stats`, `/health` (priority 10) to the server container, and all other paths (priority 1) to the web container (nginx). This lets client use relative URLs — no hardcoded hostnames in the build.

**Why relative URLs + Vite proxy:** In dev, `vite.config.ts` proxies API paths to `localhost:8000`. In prod, Traefik handles the routing. The client binary never needs to know the server's address — same build works everywhere.

**ALLOWED_ORIGINS** is configured via env var so the server's CORS policy reflects the actual domain without a code change.

---

## 2026-04-21 — Explicit int()/float() casting before JSON broadcast

**Decision:** All values stored in `cached_stats` are explicitly cast with `int()` or `float()` before being broadcast via WebSocket.

**Why:** python-bitcoinrpc parses JSON floats as Python `Decimal` objects. `Decimal` is not JSON-serializable by default, and a single leaked `Decimal` in the broadcast dict would cause `ws.send_json()` to throw, silently removing the client from the broadcast list. Explicit casting is a cheap safeguard.

---

## 2026-04-20 — ZMQ listeners with automatic reconnect

**Decision:** Both `listen_txs` and `listen_blocks` wrap their inner loop in a try/except that sleeps 5 seconds and retries on any exception.

**Why:** Without this, a single ZMQ error silently kills the listener loop. The server process stays alive but stops delivering data with no visible indication.

---

## 2026-04-23 — ZMQ block listener: 5-minute timeout + RPC fallback

**Decision:** `listen_blocks` uses `asyncio.wait_for(sock.recv_multipart(), timeout=300)`. On `asyncio.TimeoutError` it calls `getblockchaininfo` via RPC and compares node block height to `cached_stats["block_height"]`. If they differ, the missed block is fetched and broadcast. If not, "slow mining" is logged and the loop continues.

**Why:** ZMQ connections can silently hang — no exception is raised, but messages stop arriving. This is not caught by the crash-restart loop. A 5-minute timeout is long enough to not fire during normal mining but short enough to detect hangs and missed blocks before users notice a stale display.

---

## 2026-04-23 — Two-ring block visualization

**Decision:** Block visualization uses two separate rings outside the mempool ring:
1. **Mining arc ring** (`ringRadius + 36px`): clock-based arc showing real-time elapsed time since last block. Grows from last block's minute position toward current time. Color signals: grey (normal) → orange (45+ min) → red (55+ min). Hidden after 60 min.
2. **Confirmed blocks ring** (`ringRadius + 68px`): last 20 blocks evenly spaced with fixed arc width, stroke thickness proportional to tx count, yellow→orange color gradient.

**Why:** Previously both functions shared one ring, making it hard to distinguish "current block being mined" from "historical confirmed blocks". Separating them gives each ring a single clear meaning. The clock metaphor on the inner ring makes mining duration immediately readable.

---

## 2026-04-23 — Server split into modules

**Decision:** Split monolithic `main.py` (~580 lines) into eight focused modules: `state`, `config`, `rpc`, `stats`, `feeds`, `zmq_listeners`, `ws`, `main`.

**Why:** Each module now has a single reason to change. `main.py` is ~75 lines (app wiring only). The split also enables unit testing of `stats.py` functions without importing FastAPI or triggering side effects.

---

## 2026-04-23 — TX batching + pre-serialization in broadcast

**Decision:** Incoming transactions are appended to `state.tx_buffer` instead of being broadcast immediately. `flush_tx_buffer` drains the buffer every 200ms as a single `tx_batch` event. `broadcast()` serializes the event once with `json.dumps()` and sends the same string to all clients via `send_text()`.

**Why:** Without batching, a burst of 50 transactions would trigger 50 × N `send_json()` calls (where N = connected clients), each re-serializing the same object. Batching reduces serialization cost from N×M to 1 per flush interval. Pre-serialization ensures the payload is identical across all clients (no redundant `json.dumps` per client).

---

## 2026-04-23 — WebSocket send timeout (5s)

**Decision:** Each `ws.send_text()` in `broadcast()` is wrapped with `asyncio.wait_for(..., timeout=5.0)`. Any client that fails to receive within 5 seconds is disconnected.

**Why:** A slow or stuck client would block the broadcast coroutine, delaying all other clients. Disconnecting it is safe because the client-side reconnect logic immediately sends a fresh snapshot on re-connect.

---

## 2026-04-23 — BITCOIN_RPC_HOST default changed to localhost

**Decision:** `config.py` defaults `BITCOIN_RPC_HOST` to `"localhost"` instead of the former hardcoded `192.168.0.104`.

**Why:** Hardcoding a private IP as a default would silently fail for anyone cloning the repo. `localhost` is the correct default for local development; production environments always override via env var.

---

## 2026-04-23 — Parallel WebSocket broadcast

**Decision:** `broadcast()` uses `asyncio.gather` to send to all clients simultaneously instead of sequentially.

**Why:** With a sequential loop, one slow or dead client blocks all subsequent clients for up to 5 seconds per send. With `asyncio.gather` all sends run concurrently — one stuck client has zero impact on delivery time for the others. Safe to implement because `json.dumps` produces the same immutable string for all clients.

---

## 2026-04-23 — Mempool oldest tx age

**Decision:** `entry_time` (unix timestamp) is recorded on each tx dict when it arrives via ZMQ. `_refresh_stats` computes `oldest_mempool_sec = now - min(entry_times)` and includes it in `stats_update`. Displayed as a human-readable duration in the Mempool HUD block.

**Why:** Oldest unconfirmed tx age is a direct signal of mempool backlog and fee pressure — a tx stuck for 2h+ means low-fee txs aren't clearing. Server-side tracking is cheap (one `int` per tx); no extra RPC calls needed.

---

## 2026-04-23 — Per-block median fee rate in tooltip

**Decision:** `get_block_info` computes median fee rate (sat/vB) across all non-coinbase txs using data already fetched via `getblock` verbosity 2. Included in `block_seen` as `median_fee` and shown in the block segment hover tooltip.

**Why:** Median fee on a confirmed block lets users see what fee rate actually cleared in that block vs. the current mempool — useful for calibrating fee estimates. Data is free (verbosity 2 already fetched for `total_btc`); no extra RPC call needed.

---

## 2026-04-23 — Clock hands on canvas

**Decision:** Hour, minute, and second hands are drawn as thin semi-transparent lines from the canvas center, animated every frame.

**Why:** The mining arc ring is already a clock face (0–60 min). Adding clock hands makes the time reference explicit and ties the visualization to wall-clock time without requiring a separate UI element. Hands are kept semi-transparent (alpha 0.5–0.7) so they don't obscure the transaction animation behind them.
