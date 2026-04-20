import { Application, Graphics, Text, TextStyle } from "pixi.js";


const API_BASE = "http://localhost:8000";
const WS_URL = "ws://localhost:8000/ws";

const MAX_NODES = 500;
const MAX_BLOCKS = 12;
const BLOCK_FADE_DURATION = 3600000;
const NEW_TX_DURATION = 3000; // ms a tx stays "new" (purple)

type TxState = "new" | "mempool" | "high_fee" | "selected";

interface TxNode {
  txid: string;
  gfx: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  firing: boolean;
  state: TxState;
  createdAt: number;
  vsize: number | null;
  amountBtc: number | null;
  feeRate: number | null;
}

interface BlockSegment {
  gfx: Graphics;
  label: Text;
  createdAt: number;
}

const nodes = new Map<string, TxNode>();
const blockSegments: BlockSegment[] = [];

const app = new Application();
await app.init({ resizeTo: window, background: 0x000000 });
document.getElementById("app")!.appendChild(app.canvas);

function centerX() { return app.screen.width / 2; }
function centerY() { return app.screen.height / 2; }
function ringRadius() { return Math.min(centerX(), centerY()) * 0.85; }

// --- ring ---

const ringGfx = new Graphics();
app.stage.addChild(ringGfx);

function drawRing(): void {
  const cx = centerX();
  const cy = centerY();
  const r = ringRadius();
  ringGfx.clear();
  ringGfx.circle(cx, cy, r).stroke({ color: 0x334455, width: 1.5, alpha: 0.6 });
  ringGfx.circle(cx, cy, 12).stroke({ color: 0x445566, width: 1, alpha: 0.4 });
}

drawRing();
window.addEventListener("resize", () => { drawRing(); positionMempoolLabel(); });

// --- mempool label ---

const mempoolLabel = new Text({
  text: "MEMPOOL",
  style: new TextStyle({
    fill: 0x334455,
    fontSize: 14,
    fontFamily: "monospace",
    letterSpacing: 6,
  }),
});
mempoolLabel.anchor.set(0.5, 0.5);
app.stage.addChild(mempoolLabel);

function positionMempoolLabel(): void {
  mempoolLabel.x = centerX();
  mempoolLabel.y = centerY();
}

positionMempoolLabel();

// --- block segments ---

function blockStrokeWidth(sizeKb: number): number {
  if (sizeKb <= 0)  return 6;
  if (sizeKb < 200) return 4;
  if (sizeKb < 600) return 8;
  if (sizeKb < 900) return 12;
  return 16;
}

function addBlockSegment(sizeKb: number, ntx: number, totalBtc: number, height: number): void {
  const cx = centerX();
  const cy = centerY();
  const r = ringRadius();
  const segmentCount = blockSegments.length;
  const angleStep = (Math.PI * 2) / MAX_BLOCKS;
  const angle = segmentCount * angleStep - Math.PI / 2;
  const arcWidth = angleStep * 0.7;
  const strokeWidth = blockStrokeWidth(sizeKb);

  const gfx = new Graphics();
  gfx.arc(cx, cy, r, angle - arcWidth / 2, angle + arcWidth / 2)
    .stroke({ color: 0xaaaaaa, width: strokeWidth, alpha: 1 });
  app.stage.addChild(gfx);

  const labelStyle = new TextStyle({ fill: 0xffffff, fontSize: 11, fontFamily: "monospace", align: "center" });
  const heightLine = height > 0 ? `#${height.toLocaleString()}\n` : "";
  const labelText = ntx > 0 ? `${heightLine}${ntx} tx\n${totalBtc} BTC` : `${sizeKb} KB`;
  const label = new Text({ text: labelText, style: labelStyle });
  label.anchor.set(0.5, 0.5);
  label.x = cx + Math.cos(angle) * (r + 36);
  label.y = cy + Math.sin(angle) * (r + 36);
  app.stage.addChild(label);

  blockSegments.push({ gfx, label, createdAt: Date.now() });

  if (blockSegments.length > MAX_BLOCKS) {
    const old = blockSegments.shift()!;
    old.gfx.destroy();
    old.label.destroy();
  }
}

// --- tx nodes ---

const HIGH_FEE_THRESHOLD = 10; // sat/vB

function stateColor(state: TxState): number {
  if (state === "new")      return 0xaa66ff; // purple
  if (state === "high_fee") return 0xf7931a; // orange — high fee
  if (state === "selected") return 0xffdd00; // yellow
  return 0x4488ff;                            // blue — in mempool
}

function nodeRadius(amountBtc: number | null): number {
  if (amountBtc === null) return 3;
  if (amountBtc >= 100)  return 18;
  if (amountBtc >= 10)   return 13;
  if (amountBtc >= 1)    return 9;
  if (amountBtc >= 0.1)  return 6;
  if (amountBtc >= 0.01) return 4;
  return 2.5;
}

function vsizeAlpha(vsize: number | null): number {
  if (vsize === null)    return 0.7;
  if (vsize >= 10000)    return 0.3;
  if (vsize >= 1000)     return 0.5;
  if (vsize >= 500)      return 0.7;
  if (vsize >= 200)      return 0.85;
  return 1.0;
}

function drawNode(node: TxNode): void {
  const radius = nodeRadius(node.amountBtc);
  const alpha = vsizeAlpha(node.vsize);
  const color = stateColor(node.state);
  node.gfx.clear();
  if (node.state === "high_fee") {
    node.gfx.circle(0, 0, radius).fill({ color, alpha });
    node.gfx.circle(0, 0, radius).stroke({ color: 0x4488ff, width: 1.5, alpha: 0.7 });
  } else {
    node.gfx.circle(0, 0, radius).fill({ color, alpha });
  }
}

function addTx(txid: string, feeRate: number | null, vsize: number | null, amountBtc: number | null, initialState: TxState = "new"): void {
  if (nodes.has(txid)) return;
  if (nodes.size >= MAX_NODES) {
    const oldest = nodes.keys().next().value!;
    const node = nodes.get(oldest)!;
    app.stage.removeChild(node.gfx);
    node.gfx.destroy();
    nodes.delete(oldest);
  }

  const angle = Math.random() * Math.PI * 2;
  const speed = 0.2 + Math.random() * 0.3;
  const radius = nodeRadius(amountBtc);
  const alpha = vsizeAlpha(vsize);

  const gfx = new Graphics();
  gfx.circle(0, 0, radius).fill({ color: stateColor(initialState), alpha });

  if (amountBtc !== null && amountBtc >= 1) {
    const label = new Text({
      text: "₿",
      style: new TextStyle({ fill: 0xffffff, fontSize: Math.max(8, radius * 1.1), fontFamily: "monospace", fontWeight: "bold" }),
    });
    label.anchor.set(0.5, 0.5);
    gfx.addChild(label);
  }

  gfx.x = centerX();
  gfx.y = centerY();
  app.stage.addChild(gfx);

  nodes.set(txid, {
    txid, gfx, x: centerX(), y: centerY(),
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    firing: false, state: initialState, createdAt: Date.now(),
    vsize, amountBtc, feeRate,
  });
}

function flashAndClear(txids: string[]): void {
  const cx = centerX();
  const cy = centerY();
  const r = ringRadius();
  const segmentCount = blockSegments.length;
  const angleStep = (Math.PI * 2) / MAX_BLOCKS;
  const targetAngle = (segmentCount - 1) * angleStep - Math.PI / 2;
  const tx = cx + Math.cos(targetAngle) * r;
  const ty = cy + Math.sin(targetAngle) * r;

  const targets = txids.length > 0
    ? [...nodes.values()].filter(n => txids.includes(n.txid))
    : [...nodes.values()];

  for (const node of targets) {
    const dx = tx - node.x;
    const dy = ty - node.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = 3 + Math.random() * 2;
    node.vx = (dx / dist) * speed;
    node.vy = (dy / dist) * speed;
    node.firing = true;
    node.state = "selected";
    drawNode(node);
  }
}

function onBlockSeen(confirmedTxids: string[], sizeKb: number, ntx: number, totalBtc: number, height: number, time: number): void {
  addBlockSegment(sizeKb, ntx, totalBtc, height);
  flashAndClear(confirmedTxids);
  updateLatestBlock(ntx, sizeKb);
  if (time > 0) lastBlockTime = time;
}

// --- animation loop ---

app.ticker.add(() => {
  const cx = centerX();
  const cy = centerY();
  const maxRadius = ringRadius();
  const now = Date.now();

  const toRemove: string[] = [];
  for (const [txid, node] of nodes.entries()) {
    node.x += node.vx;
    node.y += node.vy;

    const dx = node.x - cx;
    const dy = node.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (node.firing && dist >= maxRadius * 0.98) {
      toRemove.push(txid);
      app.stage.removeChild(node.gfx);
      node.gfx.destroy();
      continue;
    }

    if (!node.firing && dist >= maxRadius) {
      node.x = cx + (dx / dist) * maxRadius;
      node.y = cy + (dy / dist) * maxRadius;
      node.vx = 0;
      node.vy = 0;
    }

    // transition from new → mempool or high_fee after NEW_TX_DURATION
    if (node.state === "new" && now - node.createdAt > NEW_TX_DURATION) {
      node.state = (node.feeRate !== null && node.feeRate >= HIGH_FEE_THRESHOLD)
        ? "high_fee"
        : "mempool";
      drawNode(node);
    }

    node.gfx.x = node.x;
    node.gfx.y = node.y;
  }
  for (const txid of toRemove) nodes.delete(txid);

  // fade block segments over time
  for (const seg of blockSegments) {
    const age = now - seg.createdAt;
    const alpha = Math.max(0.08, 1 - age / BLOCK_FADE_DURATION);
    seg.gfx.alpha = alpha;
    seg.label.alpha = alpha;
  }
});

// --- network ---

async function fetchSnapshot(): Promise<void> {
  const res = await fetch(`${API_BASE}/snapshot`);
  const data = await res.json();
  data.mempool.forEach((tx: { txid: string; fee_rate: number | null; vsize: number | null; amount_btc: number | null }) => {
    const state: TxState = (tx.fee_rate !== null && tx.fee_rate >= HIGH_FEE_THRESHOLD) ? "high_fee" : "mempool";
    addTx(tx.txid, tx.fee_rate, tx.vsize, tx.amount_btc, state);
  });
}

function connectWebSocket(): void {
  const ws = new WebSocket(WS_URL);
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "tx_seen") addTx(msg.txid, msg.fee_rate, msg.vsize, msg.amount_btc);
    else if (msg.type === "block_seen") onBlockSeen(msg.confirmed_txids ?? [], msg.size_kb ?? 0, msg.ntx ?? 0, msg.total_btc ?? 0, msg.height ?? 0, msg.time ?? 0);
  };
  ws.onclose = () => setTimeout(connectWebSocket, 3000);
}

fetchSnapshot();
connectWebSocket();
fetchStats();
setInterval(fetchStats, 30000);

// --- HUD ---

function timeAgo(unixTs: number): string {
  const secs = Math.floor(Date.now() / 1000) - unixTs;
  if (secs < 60)  return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  return `${mins}m ${s}s ago`;
}

let lastBlockTime = 0;

function utcTime(unixTs: number): string {
  return new Date(unixTs * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function updateHud(data: Record<string, any>): void {
  lastBlockTime = data.best_block_time;
  (document.getElementById("block-height")!).textContent =
    data.block_height.toLocaleString();
  (document.getElementById("mempool-tx")!).textContent =
    data.mempool_tx_count.toLocaleString() + " tx";
  (document.getElementById("mempool-mb")!).textContent =
    data.mempool_size_mb + " MB";
  (document.getElementById("mempool-fee")!).textContent =
    data.mempool_median_fee + " sat/vB";
  (document.getElementById("peers-count")!).textContent =
    String(data.peers);

  const hash = data.best_block_hash as string ?? "";
  (document.getElementById("latest-block-hash")!).textContent =
    hash ? hash.slice(0, 16) + "…" + hash.slice(-6) : "—";
  (document.getElementById("latest-block-time")!).textContent =
    data.best_block_time ? utcTime(data.best_block_time) : "—";

  if (data.hashrate_eh !== undefined)
    (document.getElementById("hashrate")!).textContent = data.hashrate_eh + " EH/s";
  if (data.difficulty !== undefined)
    (document.getElementById("difficulty")!).textContent =
      data.difficulty + " T";

  const dotsEl = document.getElementById("peers-dots")!;
  dotsEl.innerHTML = "";
  const count = Math.min(data.peers, 10);
  for (let i = 0; i < count; i++) {
    const d = document.createElement("div");
    d.className = "peer-dot";
    dotsEl.appendChild(d);
  }
}

function updateLatestBlock(ntx: number, sizeKb: number): void {
  (document.getElementById("latest-block-ntx")!).textContent =
    ntx.toLocaleString() + " tx";
  (document.getElementById("latest-block-size")!).textContent =
    sizeKb + " KB";
}

function updateBlockAge(): void {
  if (!lastBlockTime) return;
  const el = document.getElementById("last-block-age");
  if (el) el.textContent = timeAgo(lastBlockTime);
}

async function fetchStats(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/stats`);
    const data = await res.json();
    updateHud(data);
  } catch {}
}

setInterval(updateBlockAge, 1000);

// press 'b' to simulate a block (dev only)
window.addEventListener("keydown", (e) => {
  if (e.key === "b") onBlockSeen([], 800, 2000, 45.5, 945954, 0);
});

(window as any).simulateBlock = (sizeKb: number, ntx = 2000, totalBtc = 45.5, height = 945954) => onBlockSeen([], sizeKb, ntx, totalBtc, height, 0);
