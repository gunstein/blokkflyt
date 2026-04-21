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

## 2026-04-21 — Responsive layout: desktop + mobile

**Decision:** Use CSS media queries (≤640px breakpoint) to adapt the HUD layout for mobile. HUDs narrow to 145px, less essential blocks are hidden, the legend is hidden, and the canvas ring center shifts to 67% of screen height.

**Why:** The PixiJS canvas fills the full screen on both platforms. On mobile, the HUDs overlay the top of the canvas, so the ring must be pushed down to remain visible. Hiding non-essential blocks (network hashrate, fee histogram, activity detail) keeps the mobile view readable without a full redesign.

---

## 2026-04-21 — Explicit int()/float() casting before JSON broadcast

**Decision:** All values stored in `cached_stats` are explicitly cast with `int()` or `float()` before being broadcast via WebSocket.

**Why:** python-bitcoinrpc parses JSON floats as Python `Decimal` objects. `Decimal` is not JSON-serializable by default, and a single leaked `Decimal` in the broadcast dict would cause `ws.send_json()` to throw, silently removing the client from the broadcast list. Explicit casting is a cheap safeguard.

---

## 2026-04-20 — ZMQ listeners with automatic reconnect

**Decision:** Both `listen_txs` and `listen_blocks` wrap their inner loop in a try/except that sleeps 5 seconds and retries on any exception.

**Why:** Without this, a single ZMQ error silently kills the listener loop. The server process stays alive but stops delivering data with no visible indication.
