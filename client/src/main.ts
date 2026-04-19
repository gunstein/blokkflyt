import { Application, Graphics } from "pixi.js";

const API_BASE = "http://localhost:8000";
const WS_URL = "ws://localhost:8000/ws";

const MAX_NODES = 500;

interface TxNode {
  txid: string;
  gfx: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const nodes = new Map<string, TxNode>();

const app = new Application();
await app.init({ resizeTo: window, background: 0x000000 });
document.getElementById("app")!.appendChild(app.canvas);

function centerX() { return app.screen.width / 2; }
function centerY() { return app.screen.height / 2; }

function feeColor(feeRate: number | null): number {
  if (feeRate === null) return 0x6666ff; // purple — unknown
  if (feeRate < 5)   return 0x8888ff;   // blue — low fee
  if (feeRate < 20)  return 0x44cc88;   // green — medium fee
  if (feeRate < 50)  return 0xf7931a;   // orange — high fee
  return 0xff3333;                       // red — very high fee
}

function feeRadius(feeRate: number | null): number {
  if (feeRate === null) return 3;
  if (feeRate < 5)  return 2;
  if (feeRate < 20) return 3;
  if (feeRate < 50) return 4.5;
  return 6;
}

function addTx(txid: string, feeRate: number | null): void {
  if (nodes.has(txid)) return;
  if (nodes.size >= MAX_NODES) return;

  const angle = Math.random() * Math.PI * 2;
  const speed = 0.2 + Math.random() * 0.3;
  const color = feeColor(feeRate);
  const radius = feeRadius(feeRate);

  const gfx = new Graphics();
  gfx.circle(0, 0, radius).fill({ color, alpha: 0.85 });
  gfx.x = centerX();
  gfx.y = centerY();
  app.stage.addChild(gfx);

  nodes.set(txid, {
    txid,
    gfx,
    x: centerX(),
    y: centerY(),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
  });
}

function onBlockSeen(): void {
  for (const node of nodes.values()) {
    app.stage.removeChild(node.gfx);
    node.gfx.destroy();
  }
  nodes.clear();
}

app.ticker.add(() => {
  const cx = centerX();
  const cy = centerY();
  const maxRadius = Math.min(cx, cy) * 0.85;

  for (const node of nodes.values()) {
    node.x += node.vx;
    node.y += node.vy;

    const dx = node.x - cx;
    const dy = node.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist >= maxRadius) {
      node.x = cx + (dx / dist) * maxRadius;
      node.y = cy + (dy / dist) * maxRadius;
      node.vx = 0;
      node.vy = 0;
    }

    node.gfx.x = node.x;
    node.gfx.y = node.y;
  }
});

async function fetchSnapshot(): Promise<void> {
  const res = await fetch(`${API_BASE}/snapshot`);
  const data = await res.json();
  data.mempool.forEach((tx: { txid: string; fee_rate: number | null }) =>
    addTx(tx.txid, tx.fee_rate)
  );
}

function connectWebSocket(): void {
  const ws = new WebSocket(WS_URL);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "tx_seen") addTx(msg.txid, msg.fee_rate);
    else if (msg.type === "block_seen") onBlockSeen();
  };

  ws.onclose = () => setTimeout(connectWebSocket, 3000);
}

fetchSnapshot();
connectWebSocket();
