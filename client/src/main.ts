import { Application, Graphics } from "pixi.js";

const API_BASE = "http://localhost:8000";
const WS_URL = "ws://localhost:8000/ws";

const MAX_NODES = 500;
const MAX_BLOCKS = 12;
const BLOCK_FADE_DURATION = 3600000; // ms until fully faded (1 hour)

interface TxNode {
  txid: string;
  gfx: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  firing: boolean;
}

interface BlockSegment {
  gfx: Graphics;
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
window.addEventListener("resize", drawRing);

// --- block segments ---

function blockStrokeWidth(sizeKb: number): number {
  if (sizeKb <= 0)    return 6;
  if (sizeKb < 200)   return 4;
  if (sizeKb < 600)   return 8;
  if (sizeKb < 900)   return 12;
  return 16;
}

function addBlockSegment(sizeKb: number): void {
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
    .stroke({ color: 0xf7931a, width: strokeWidth, alpha: 1 });
  app.stage.addChild(gfx);

  blockSegments.push({ gfx, createdAt: Date.now() });

  if (blockSegments.length > MAX_BLOCKS) {
    const old = blockSegments.shift()!;
    old.gfx.destroy();
  }
}

// --- tx nodes ---

function feeColor(feeRate: number | null): number {
  if (feeRate === null) return 0x6666ff;
  if (feeRate < 2)   return 0x8888ff;   // blue — very low
  if (feeRate < 5)   return 0x44cc88;   // green — low
  if (feeRate < 15)  return 0xf7931a;   // orange — medium
  return 0xff3333;                       // red — high
}

function vsizeRadius(vsize: number | null): number {
  if (vsize === null) return 3;
  if (vsize < 200)  return 2.5;
  if (vsize < 500)  return 4;
  if (vsize < 1000) return 6;
  return 9;
}

function amountAlpha(amountBtc: number | null): number {
  if (amountBtc === null) return 0.6;
  if (amountBtc < 0.01) return 0.4;
  if (amountBtc < 0.1)  return 0.6;
  if (amountBtc < 1)    return 0.8;
  return 1.0;
}

function addTx(txid: string, feeRate: number | null, vsize: number | null, amountBtc: number | null): void {
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
  const color = feeColor(feeRate);
  const radius = vsizeRadius(vsize);
  const alpha = amountAlpha(amountBtc);

  const gfx = new Graphics();
  gfx.circle(0, 0, radius).fill({ color, alpha });
  gfx.x = centerX();
  gfx.y = centerY();
  app.stage.addChild(gfx);

  nodes.set(txid, { txid, gfx, x: centerX(), y: centerY(),
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, firing: false });
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
  }
}

function onBlockSeen(confirmedTxids: string[], sizeKb: number): void {
  addBlockSegment(sizeKb);
  flashAndClear(confirmedTxids);
}

// --- animation loop ---

app.ticker.add(() => {
  const cx = centerX();
  const cy = centerY();
  const maxRadius = ringRadius();

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
    }

    node.gfx.x = node.x;
    node.gfx.y = node.y;
  }
  for (const txid of toRemove) nodes.delete(txid);

  // fade block segments over time
  const now = Date.now();
  for (const seg of blockSegments) {
    const age = now - seg.createdAt;
    const alpha = Math.max(0.08, 1 - age / BLOCK_FADE_DURATION);
    seg.gfx.alpha = alpha;
  }
});

// --- network ---

async function fetchSnapshot(): Promise<void> {
  const res = await fetch(`${API_BASE}/snapshot`);
  const data = await res.json();
  data.mempool.forEach((tx: { txid: string; fee_rate: number | null; vsize: number | null; amount_btc: number | null }) =>
    addTx(tx.txid, tx.fee_rate, tx.vsize, tx.amount_btc)
  );
}

function connectWebSocket(): void {
  const ws = new WebSocket(WS_URL);
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "tx_seen") addTx(msg.txid, msg.fee_rate, msg.vsize, msg.amount_btc);
    else if (msg.type === "block_seen") onBlockSeen(msg.confirmed_txids ?? [], msg.size_kb ?? 0);
  };
  ws.onclose = () => setTimeout(connectWebSocket, 3000);
}

fetchSnapshot();
connectWebSocket();

// press 'b' to simulate a block (dev only)
window.addEventListener("keydown", (e) => {
  if (e.key === "b") onBlockSeen([], 800);
});

(window as any).simulateBlock = (sizeKb: number) => onBlockSeen([], sizeKb);
