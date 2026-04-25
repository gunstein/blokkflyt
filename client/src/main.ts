import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import { initMobileHudToggle, initWakeLock, initVersionInfo } from "./ui";

declare const __APP_VERSION__: string;
import { type TxState, HIGH_FEE_THRESHOLD, nodeRadius, vsizeAlpha, stateColor, blockStrokeWidth } from "./utils";
import { type StatsPayload, type WsMessage } from "./types";
import { updateHud, updatePrice, updateSparkline, updateNewsTicker, updateLatestBlock, setLastBlockTime, showTooltip, showBlockTooltip, moveTooltip, hideTooltip } from "./hud";

const API_BASE = "";  // relative; Vite proxy in dev, Traefik in prod
const WS_URL   = `${location.protocol.replace("http", "ws")}//${location.host}/ws`;

const MAX_NODES            = 500;
const MAX_BLOCKS           = 20;
const HOUR_SECS            = 3600;
const NEW_TX_MS            = 3_000;
const MOBILE_BREAKPOINT    = 640;
const MOBILE_CENTER_RATIO  = 0.50;
const DESKTOP_CENTER_SHIFT = 40;   // px above screen center on desktop

interface TxNode {
  txid: string;
  gfx: Container;
  circle: Graphics;
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
  createdAt: number;
  height: number;
  ntx: number;
  sizeKb: number;
  totalBtc: number;
  medianFee: number | null;
}

const nodes         = new Map<string, TxNode>();
const blockSegments: BlockSegment[] = [];
let currentMiningStartTime = 0;

const app = new Application();
await app.init({ resizeTo: window, background: 0x000000 });
app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
document.getElementById("app")!.appendChild(app.canvas);

function centerX(): number { return app.screen.width / 2; }
function centerY(): number {
  return window.innerWidth <= MOBILE_BREAKPOINT
    ? app.screen.height * MOBILE_CENTER_RATIO
    : app.screen.height / 2 - DESKTOP_CENTER_SHIFT;
}
function ringRadius(): number           { return Math.min(centerX(), centerY()) * 0.72; }
function blockRingRadius(): number      { return ringRadius() + 36; }   // mining arc
function confirmedRingRadius(): number  { return ringRadius() + 68; }   // confirmed blocks

// Converts seconds-within-hour to canvas angle (0 = top, clockwise)
function secInHourToAngle(sec: number): number {
  return (sec / HOUR_SECS) * Math.PI * 2 - Math.PI / 2;
}

// --- ring ---

const ringGfx      = new Graphics();
const miningArcGfx = new Graphics();
const clockHandGfx = new Graphics();
app.stage.addChild(ringGfx);
app.stage.addChild(miningArcGfx);
app.stage.addChild(clockHandGfx);

function drawRing(): void {
  const cx = centerX(), cy = centerY(), r = ringRadius();
  const br = blockRingRadius();
  const cr = confirmedRingRadius();
  ringGfx.clear();
  // Mempool ring
  ringGfx.circle(cx, cy, r).stroke({ color: 0x334455, width: 1.5, alpha: 0.6 });
  ringGfx.circle(cx, cy, 12).stroke({ color: 0x445566, width: 1, alpha: 0.4 });
  // Mining arc ring + quarter-hour ticks
  ringGfx.circle(cx, cy, br).stroke({ color: 0x1a2a3a, width: 1, alpha: 0.5 });
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 - Math.PI / 2;
    ringGfx
      .moveTo(cx + Math.cos(angle) * (br - 6), cy + Math.sin(angle) * (br - 6))
      .lineTo(cx + Math.cos(angle) * (br + 6), cy + Math.sin(angle) * (br + 6))
      .stroke({ color: 0x334455, width: 1, alpha: 0.6 });
  }
  // Confirmed blocks ring (evenly spaced, no time meaning)
  ringGfx.circle(cx, cy, cr).stroke({ color: 0x1a2a3a, width: 1, alpha: 0.5 });
}

function drawClockHand(): void {
  const cx = centerX(), cy = centerY();
  const br = blockRingRadius();
  const ir = ringRadius();

  const now      = new Date();
  const totalSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() + now.getMilliseconds() / 1000;
  const secInHour = totalSec % HOUR_SECS;

  const nowAngle  = secInHourToAngle(secInHour);
  const secAngle  = (totalSec % 60 / 60)     * Math.PI * 2 - Math.PI / 2;
  const minAngle  = (totalSec % 3600 / 3600)  * Math.PI * 2 - Math.PI / 2;
  const hourAngle = (totalSec % 43200 / 43200) * Math.PI * 2 - Math.PI / 2;

  clockHandGfx.clear();

  // Nål on block ring — shows current time on the 1-hour arc
  clockHandGfx
    .moveTo(cx + Math.cos(nowAngle) * (br - 8), cy + Math.sin(nowAngle) * (br - 8))
    .lineTo(cx + Math.cos(nowAngle) * (br + 8), cy + Math.sin(nowAngle) * (br + 8))
    .stroke({ color: 0x667788, width: 2, alpha: 0.8 });

  // Hour hand
  clockHandGfx
    .moveTo(cx, cy)
    .lineTo(cx + Math.cos(hourAngle) * ir * 0.52, cy + Math.sin(hourAngle) * ir * 0.52)
    .stroke({ color: 0x6699cc, width: 4, alpha: 0.7 });

  // Minute hand
  clockHandGfx
    .moveTo(cx, cy)
    .lineTo(cx + Math.cos(minAngle) * ir * 0.75, cy + Math.sin(minAngle) * ir * 0.75)
    .stroke({ color: 0x55bbdd, width: 2.5, alpha: 0.6 });

  // Second hand
  clockHandGfx
    .moveTo(cx, cy)
    .lineTo(cx + Math.cos(secAngle) * ir * 0.85, cy + Math.sin(secAngle) * ir * 0.85)
    .stroke({ color: 0x33ddee, width: 1.5, alpha: 0.5 });

  // Centre dot
  clockHandGfx.circle(cx, cy, 4).fill({ color: 0x6699cc, alpha: 0.8 });
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
drawClockHand();
positionMempoolLabel();
window.addEventListener("resize", () => { drawRing(); drawClockHand(); positionMempoolLabel(); });

// --- block segments ---

function addBlockSegment(
  ntx: number, sizeKb: number, totalBtc: number, height: number, medianFee: number | null,
): { x: number; y: number } {
  const cx = centerX(), cy = centerY(), r = confirmedRingRadius();
  const angleStep = (Math.PI * 2) / MAX_BLOCKS;
  const angle     = blockSegments.length * angleStep - Math.PI / 2;
  const arcWidth  = angleStep * 0.65;

  const gfx = new Graphics();
  gfx.arc(cx, cy, r, angle - arcWidth / 2, angle + arcWidth / 2)
    .stroke({ color: 0xffffff, width: blockStrokeWidth(ntx), alpha: 1 });
  gfx.eventMode = "static";
  gfx.cursor    = "crosshair";
  app.stage.addChild(gfx);

  gfx.on("pointerover", (e) => showBlockTooltip(height, ntx, sizeKb, totalBtc, medianFee, e.client.x, e.client.y));
  gfx.on("pointermove", (e) => moveTooltip(e.client.x, e.client.y));
  gfx.on("pointerout",  ()  => hideTooltip());

  blockSegments.push({ gfx, createdAt: Date.now(), height, ntx, sizeKb, totalBtc, medianFee });

  if (blockSegments.length > MAX_BLOCKS) {
    const old = blockSegments.shift()!;
    old.gfx.destroy();
  }

  return {
    x: cx + Math.cos(angle) * r,
    y: cy + Math.sin(angle) * r,
  };
}

// --- tx nodes ---

function drawNode(node: TxNode): void {
  const radius = nodeRadius(node.amountBtc);
  const alpha  = vsizeAlpha(node.vsize);
  const color  = stateColor(node.state);
  node.circle.clear();
  node.circle.circle(0, 0, radius).fill({ color, alpha });
  if (node.state === "high_fee")
    node.circle.circle(0, 0, radius).stroke({ color: 0x4488ff, width: 1.5, alpha: 0.7 });
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

  const angle  = Math.random() * Math.PI * 2;
  const speed  = 0.2 + Math.random() * 0.3;
  const gfx    = new Container();
  const circle = new Graphics();
  gfx.addChild(circle);

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
    txid, gfx, circle,
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

function animateConfirmedTxs(txids: string[], tx: number, ty: number): void {
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

function onBlockSeen(
  confirmedTxids: string[],
  sizeKb: number, ntx: number, totalBtc: number, height: number, time: number, medianFee: number | null,
): void {
  const target = addBlockSegment(ntx, sizeKb, totalBtc, height, medianFee);
  animateConfirmedTxs(confirmedTxids, target.x, target.y);
  updateLatestBlock(ntx, sizeKb);
  if (time > 0) {
    setLastBlockTime(time);
    currentMiningStartTime = time;
  }
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

  drawClockHand();

  // Growing arc: current block being mined (inner ring)
  if (currentMiningStartTime > 0) {
    const cx = centerX(), cy = centerY(), r = blockRingRadius();
    const elapsedSec  = now / 1000 - currentMiningStartTime;
    const startSec    = currentMiningStartTime % HOUR_SECS;
    const cappedDur   = Math.min(elapsedSec, HOUR_SECS - 1);
    const startAngle  = secInHourToAngle(startSec);
    const endAngle    = secInHourToAngle(startSec + cappedDur);

    miningArcGfx.clear();
    if (elapsedSec < HOUR_SECS) {
      // Growing arc — normal case
      const color = elapsedSec < 2700 ? 0xaabbcc   // < 45 min: grey
                  : elapsedSec < 3300 ? 0xf7931a   // 45–55 min: orange
                  : 0xff4444;                        // 55–60 min: red
      miningArcGfx.arc(cx, cy, r, startAngle, endAngle)
        .stroke({ color, width: 2, alpha: 0.45 });
    }
    // > 60 min: nothing extra shown (handled by confirmed blocks ring)
  }

  for (const [i, seg] of blockSegments.entries()) {
    // Color gradient: oldest = dark orange, newest = bright yellow
    const posRatio = blockSegments.length > 1 ? i / (blockSegments.length - 1) : 1;
    const rv = Math.round(0xcc + posRatio * (0xff - 0xcc));
    const gv = Math.round(0x44 + posRatio * (0xee - 0x44));
    const bv = Math.round(0x00 + posRatio * (0x44 - 0x00));
    seg.gfx.tint  = (rv << 16) | (gv << 8) | bv;
    const stepsFromNewest = blockSegments.length - 1 - i;
    seg.gfx.alpha = Math.max(0.25, Math.pow(0.85, stepsFromNewest));
  }
});

// --- network ---

const connectionStatusEl = document.getElementById("connection-status")!;

function connectWebSocket(): void {
  const ws = new WebSocket(WS_URL);
  ws.onopen  = () => { connectionStatusEl.style.display = "none"; };
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data) as WsMessage;
    if      (msg.type === "tx_seen")          addTx(msg.txid, msg.fee_rate, msg.vsize, msg.amount_btc);
    else if (msg.type === "tx_batch")         for (const tx of msg.txs) addTx(tx.txid, tx.fee_rate, tx.vsize, tx.amount_btc);
    else if (msg.type === "block_seen")      onBlockSeen(msg.confirmed_txids ?? [], msg.size_kb ?? 0, msg.ntx ?? 0, msg.total_btc ?? 0, msg.height ?? 0, msg.time ?? 0, msg.median_fee ?? null);
    else if (msg.type === "stats_update") {
      if (currentMiningStartTime === 0 && msg.best_block_time) currentMiningStartTime = msg.best_block_time;
      updateHud(msg);
    }
    else if (msg.type === "price_update")    updatePrice(msg);
    else if (msg.type === "sparkline_update") updateSparkline(msg.prices);
    else if (msg.type === "news_update")     updateNewsTicker(msg.items);
  };
  ws.onclose = () => {
    connectionStatusEl.style.display = "block";
    setTimeout(connectWebSocket, 3000);
  };
}

async function fetchStats(): Promise<void> {
  try {
    const res  = await fetch(`${API_BASE}/stats`);
    const data = await res.json() as StatsPayload;
    if (currentMiningStartTime === 0 && data.best_block_time) currentMiningStartTime = data.best_block_time;
    updateHud(data);
  } catch {}
}

connectWebSocket();
fetchStats();
initMobileHudToggle();
initWakeLock();
initVersionInfo(API_BASE);
