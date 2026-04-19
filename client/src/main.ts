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

function addTx(txid: string): void {
  if (nodes.has(txid)) return;
  if (nodes.size >= MAX_NODES) return;

  const angle = Math.random() * Math.PI * 2;
  const speed = 0.2 + Math.random() * 0.3;

  const gfx = new Graphics();
  gfx.circle(0, 0, 3).fill({ color: 0xf7931a, alpha: 0.8 });
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
  data.mempool.forEach((txid: string) => addTx(txid));
}

function connectWebSocket(): void {
  const ws = new WebSocket(WS_URL);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "tx_seen") addTx(msg.txid);
    else if (msg.type === "block_seen") onBlockSeen();
  };

  ws.onclose = () => setTimeout(connectWebSocket, 3000);
}

fetchSnapshot();
connectWebSocket();
