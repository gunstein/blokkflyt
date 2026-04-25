import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { type TxState, HIGH_FEE_THRESHOLD, nodeRadius, vsizeAlpha, stateColor } from "./utils";
import { showTooltip, moveTooltip, hideTooltip } from "./hud";
import { centerX, centerY, ringRadius } from "./canvas";

const MAX_NODES = 500;
const NEW_TX_MS = 3_000;

export interface TxNode {
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

export const nodes = new Map<string, TxNode>();

let _stage: Container;
let _lastCx = 0, _lastCy = 0, _lastR = 0;

export function initNodes(stage: Container): void {
  _stage  = stage;
  _lastCx = centerX();
  _lastCy = centerY();
  _lastR  = ringRadius();
}

export function rescaleNodes(): void {
  const newCx = centerX(), newCy = centerY(), newR = ringRadius();
  if (_lastR === 0) return;
  const scale = newR / _lastR;
  for (const node of nodes.values()) {
    const dx = node.x - _lastCx, dy = node.y - _lastCy;
    node.x      = newCx + dx * scale;
    node.y      = newCy + dy * scale;
    node.vx    *= scale;
    node.vy    *= scale;
    node.gfx.x  = node.x;
    node.gfx.y  = node.y;
  }
  _lastCx = newCx; _lastCy = newCy; _lastR = newR;
}

export function drawNode(node: TxNode): void {
  const radius = nodeRadius(node.amountBtc);
  const alpha  = vsizeAlpha(node.vsize);
  const color  = stateColor(node.state);
  node.circle.clear();
  node.circle.circle(0, 0, radius).fill({ color, alpha });
  if (node.state === "high_fee")
    node.circle.circle(0, 0, radius).stroke({ color: 0x4488ff, width: 1.5, alpha: 0.7 });
}

export function addTx(
  txid: string, feeRate: number | null, vsize: number | null,
  amountBtc: number | null, initialState: TxState = "new",
): void {
  if (nodes.has(txid)) return;
  if (nodes.size >= MAX_NODES) {
    const oldest = nodes.keys().next().value!;
    const node   = nodes.get(oldest)!;
    _stage.removeChild(node.gfx);
    node.gfx.destroy();
    nodes.delete(oldest);
  }

  const angle  = Math.random() * Math.PI * 2;
  const speed  = 0.2 + Math.random() * 0.3;
  const gfx    = new Container();
  const circle = new Graphics();
  gfx.addChild(circle);

  if (amountBtc !== null && amountBtc >= 1) {
    const radius   = nodeRadius(amountBtc);
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
  _stage.addChild(gfx);

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

export function animateConfirmedTxs(txids: string[], tx: number, ty: number): void {
  const targets = txids.length > 0
    ? [...nodes.values()].filter(n => txids.includes(n.txid))
    : [...nodes.values()];

  for (const node of targets) {
    const dx = tx - node.x, dy = ty - node.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    node.vx    = (dx / dist) * (3 + Math.random() * 2);
    node.vy    = (dy / dist) * (3 + Math.random() * 2);
    node.firing = true;
    node.state  = "selected";
    drawNode(node);
  }
}

export function tickNodes(): void {
  const cx        = centerX(), cy = centerY();
  const maxRadius = ringRadius();
  const now       = Date.now();
  const toRemove: string[] = [];

  for (const [txid, node] of nodes.entries()) {
    node.x += node.vx;
    node.y += node.vy;

    const dx   = node.x - cx, dy = node.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (node.firing && dist >= maxRadius * 0.98) {
      toRemove.push(txid);
      _stage.removeChild(node.gfx);
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

  _lastCx = cx; _lastCy = cy; _lastR = maxRadius;
}
