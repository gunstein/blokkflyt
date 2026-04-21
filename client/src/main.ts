import { Application, Graphics, Text, TextStyle } from "pixi.js";
import { type TxState, HIGH_FEE_THRESHOLD, nodeRadius, vsizeAlpha, stateColor, blockStrokeWidth } from "./utils";
import { type StatsPayload } from "./types";
import { updateHud, updatePrice, updateSparkline, updateNewsTicker, updateLatestBlock, setLastBlockTime, showTooltip, moveTooltip, hideTooltip } from "./hud";

const API_BASE = "http://localhost:8000";
const WS_URL   = "ws://localhost:8000/ws";

const MAX_NODES            = 500;
const MAX_BLOCKS           = 12;
const BLOCK_FADE_MS        = 3_600_000;
const NEW_TX_MS            = 3_000;
const MOBILE_BREAKPOINT    = 640;
const MOBILE_CENTER_RATIO  = 0.67;
const DESKTOP_CENTER_SHIFT = 40;   // px above screen center on desktop

interface TxNode {
  txid: string;
  gfx: Graphics;
  x: number; y: number;
  vx: number; vy: number;
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

const nodes         = new Map<string, TxNode>();
const blockSegments: BlockSegment[] = [];

const app = new Application();
await app.init({ resizeTo: window, background: 0x000000 });
document.getElementById("app")!.appendChild(app.canvas);

function centerX(): number { return app.screen.width / 2; }
function centerY(): number {
  return window.innerWidth <= MOBILE_BREAKPOINT
    ? app.screen.height * MOBILE_CENTER_RATIO
    : app.screen.height / 2 - DESKTOP_CENTER_SHIFT;
}
function ringRadius(): number { return Math.min(centerX(), centerY()) * 0.85; }

// --- ring ---

const ringGfx = new Graphics();
app.stage.addChild(ringGfx);

function drawRing(): void {
  const cx = centerX(), cy = centerY(), r = ringRadius();
  ringGfx.clear();
  ringGfx.circle(cx, cy, r).stroke({ color: 0x334455, width: 1.5, alpha: 0.6 });
  ringGfx.circle(cx, cy, 12).stroke({ color: 0x445566, width: 1, alpha: 0.4 });
}

const mempoolLabel = new Text({
  text: "MEMPOOL",
  style: new TextStyle({ fill: 0x334455, fontSize: 14, fontFamily: "monospace", letterSpacing: 6 }),
});
mempoolLabel.anchor.set(0.5, 0.5);
app.stage.addChild(mempoolLabel);

function positionMempoolLabel(): void {
  mempoolLabel.x = centerX();
  mempoolLabel.y = centerY();
}

drawRing();
positionMempoolLabel();
window.addEventListener("resize", () => { drawRing(); positionMempoolLabel(); });

// --- block segments ---

function addBlockSegment(sizeKb: number, ntx: number, totalBtc: number, height: number): void {
  const cx = centerX(), cy = centerY(), r = ringRadius();
  const angleStep = (Math.PI * 2) / MAX_BLOCKS;
  const angle     = blockSegments.length * angleStep - Math.PI / 2;
  const arcWidth  = angleStep * 0.7;

  const gfx = new Graphics();
  gfx.arc(cx, cy, r, angle - arcWidth / 2, angle + arcWidth / 2)
    .stroke({ color: 0xaaaaaa, width: blockStrokeWidth(sizeKb), alpha: 1 });
  app.stage.addChild(gfx);

  const heightLine = height > 0 ? `#${height.toLocaleString()}\n` : "";
  const labelText  = ntx > 0 ? `${heightLine}${ntx} tx\n${totalBtc} BTC` : `${sizeKb} KB`;
  const label = new Text({
    text: labelText,
    style: new TextStyle({ fill: 0xffffff, fontSize: 11, fontFamily: "monospace", align: "center" }),
  });
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

function drawNode(node: TxNode): void {
  const radius = nodeRadius(node.amountBtc);
  const alpha  = vsizeAlpha(node.vsize);
  const color  = stateColor(node.state);
  node.gfx.clear();
  node.gfx.circle(0, 0, radius).fill({ color, alpha });
  if (node.state === "high_fee")
    node.gfx.circle(0, 0, radius).stroke({ color: 0x4488ff, width: 1.5, alpha: 0.7 });
}

function addTx(txid: string, feeRate: number | null, vsize: number | null, amountBtc: number | null, initialState: TxState = "new"): void {
  if (nodes.has(txid)) return;
  if (nodes.size >= MAX_NODES) {
    const oldest = nodes.keys().next().value!;
    const node   = nodes.get(oldest)!;
    app.stage.removeChild(node.gfx);
    node.gfx.destroy();
    nodes.delete(oldest);
  }

  const angle = Math.random() * Math.PI * 2;
  const speed = 0.2 + Math.random() * 0.3;
  const gfx   = new Graphics();

  if (amountBtc !== null && amountBtc >= 1) {
    const radius = nodeRadius(amountBtc);
    const btcLabel = new Text({
      text: "₿",
      style: new TextStyle({ fill: 0xffffff, fontSize: Math.max(8, radius * 1.1), fontFamily: "monospace", fontWeight: "bold" }),
    });
    btcLabel.anchor.set(0.5, 0.5);
    gfx.addChild(btcLabel);
  }

  gfx.eventMode = "static";
  gfx.cursor    = "crosshair";
  gfx.x = centerX();
  gfx.y = centerY();
  app.stage.addChild(gfx);

  const node: TxNode = {
    txid, gfx,
    x: centerX(), y: centerY(),
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    firing: false, state: initialState, createdAt: Date.now(),
    vsize, amountBtc, feeRate,
  };
  nodes.set(txid, node);
  drawNode(node);

  gfx.on("pointerover", (e) => showTooltip(node.txid, node.feeRate, node.amountBtc, node.vsize, e.client.x, e.client.y));
  gfx.on("pointermove", (e) => moveTooltip(e.client.x, e.client.y));
  gfx.on("pointerout",  ()  => hideTooltip());
}

// --- block arrival ---

function animateConfirmedTxs(txids: string[]): void {
  const cx = centerX(), cy = centerY(), r = ringRadius();
  const angleStep  = (Math.PI * 2) / MAX_BLOCKS;
  const targetAngle = (blockSegments.length - 1) * angleStep - Math.PI / 2;
  const tx = cx + Math.cos(targetAngle) * r;
  const ty = cy + Math.sin(targetAngle) * r;

  const targets = txids.length > 0
    ? [...nodes.values()].filter(n => txids.includes(n.txid))
    : [...nodes.values()];

  for (const node of targets) {
    const dx = tx - node.x, dy = ty - node.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    node.vx = (dx / dist) * (3 + Math.random() * 2);
    node.vy = (dy / dist) * (3 + Math.random() * 2);
    node.firing = true;
    node.state  = "selected";
    drawNode(node);
  }
}

function onBlockSeen(confirmedTxids: string[], sizeKb: number, ntx: number, totalBtc: number, height: number, time: number): void {
  addBlockSegment(sizeKb, ntx, totalBtc, height);
  animateConfirmedTxs(confirmedTxids);
  updateLatestBlock(ntx, sizeKb);
  if (time > 0) setLastBlockTime(time);
}

// --- animation loop ---

app.ticker.add(() => {
  const cx = centerX(), cy = centerY();
  const maxRadius = ringRadius();
  const now = Date.now();

  const toRemove: string[] = [];
  for (const [txid, node] of nodes.entries()) {
    node.x += node.vx;
    node.y += node.vy;

    const dx   = node.x - cx, dy = node.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (node.firing && dist >= maxRadius * 0.98) {
      toRemove.push(txid);
      app.stage.removeChild(node.gfx);
      node.gfx.destroy();
      continue;
    }

    if (!node.firing && dist >= maxRadius) {
      node.x  = cx + (dx / dist) * maxRadius;
      node.y  = cy + (dy / dist) * maxRadius;
      node.vx = 0;
      node.vy = 0;
    }

    if (node.state === "new" && now - node.createdAt > NEW_TX_MS) {
      node.state = (node.feeRate !== null && node.feeRate >= HIGH_FEE_THRESHOLD) ? "high_fee" : "mempool";
      drawNode(node);
    }

    node.gfx.x = node.x;
    node.gfx.y = node.y;
  }
  for (const txid of toRemove) nodes.delete(txid);

  for (const seg of blockSegments) {
    const alpha  = Math.max(0.08, 1 - (now - seg.createdAt) / BLOCK_FADE_MS);
    seg.gfx.alpha   = alpha;
    seg.label.alpha = alpha;
  }
});

// --- network ---

async function fetchSnapshot(): Promise<void> {
  const res  = await fetch(`${API_BASE}/snapshot`);
  const data = await res.json();
  data.mempool.forEach((tx: { txid: string; fee_rate: number | null; vsize: number | null; amount_btc: number | null }) => {
    const state: TxState = (tx.fee_rate !== null && tx.fee_rate >= HIGH_FEE_THRESHOLD) ? "high_fee" : "mempool";
    addTx(tx.txid, tx.fee_rate, tx.vsize, tx.amount_btc, state);
  });
}

const connectionStatusEl = document.getElementById("connection-status")!;

function connectWebSocket(): void {
  const ws = new WebSocket(WS_URL);
  ws.onopen  = () => { connectionStatusEl.style.display = "none"; };
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if      (msg.type === "tx_seen")          addTx(msg.txid, msg.fee_rate, msg.vsize, msg.amount_btc);
    else if (msg.type === "block_seen")        onBlockSeen(msg.confirmed_txids ?? [], msg.size_kb ?? 0, msg.ntx ?? 0, msg.total_btc ?? 0, msg.height ?? 0, msg.time ?? 0);
    else if (msg.type === "stats_update")      updateHud(msg);
    else if (msg.type === "price_update")      updatePrice(msg);
    else if (msg.type === "sparkline_update")  updateSparkline(msg.prices);
    else if (msg.type === "news_update")       updateNewsTicker(msg.items);
  };
  ws.onclose = () => {
    connectionStatusEl.style.display = "block";
    setTimeout(connectWebSocket, 3000);
  };
}

async function fetchStats(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/stats`);
    updateHud(await res.json() as StatsPayload);
  } catch {}
}

fetchSnapshot();
connectWebSocket();
fetchStats();
