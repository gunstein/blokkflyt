import { Application, Graphics, Text, TextStyle } from "pixi.js";
import { type TxState, HIGH_FEE_THRESHOLD, nodeRadius, vsizeAlpha, stateColor, blockStrokeWidth, timeAgo, newsTimeAgo } from "./utils";


const API_BASE = "http://localhost:8000";
const WS_URL = "ws://localhost:8000/ws";

const MAX_NODES = 500;
const MAX_BLOCKS = 12;
const BLOCK_FADE_DURATION = 3600000;
const NEW_TX_DURATION = 3000; // ms a tx stays "new" (purple)


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

interface ActivityPayload {
  status: string;
  deviation_pct: number | null;
  baseline: number | null;
}

interface SupplyPayload {
  circulating_btc: number;
  percent_mined: number;
  current_subsidy: number;
  next_halving_block: number;
  blocks_until_halving: number;
  days_until_halving: number;
}

interface StatsPayload {
  block_height: number;
  best_block_hash: string;
  best_block_time: number;
  mempool_tx_count: number;
  mempool_size_mb: number;
  mempool_median_fee: number | null;
  peers: number;
  hashrate_eh?: number;
  difficulty?: number;
  daily_tx_count?: number;
  fee_fast?: number | null;
  fee_medium?: number | null;
  fee_slow?: number | null;
  activity?: ActivityPayload;
  fee_histogram?: { label: string; count: number }[];
  supply?: SupplyPayload;
}

const nodes = new Map<string, TxNode>();
const blockSegments: BlockSegment[] = [];

const app = new Application();
await app.init({ resizeTo: window, background: 0x000000 });
document.getElementById("app")!.appendChild(app.canvas);

function centerX() { return app.screen.width / 2; }
function centerY() {
  return window.innerWidth <= 640
    ? app.screen.height * 0.67
    : app.screen.height / 2 - 40;
}
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

  const gfx = new Graphics();
  if (amountBtc !== null && amountBtc >= 1) {
    const radius = nodeRadius(amountBtc);
    const label = new Text({
      text: "₿",
      style: new TextStyle({ fill: 0xffffff, fontSize: Math.max(8, radius * 1.1), fontFamily: "monospace", fontWeight: "bold" }),
    });
    label.anchor.set(0.5, 0.5);
    gfx.addChild(label);
  }

  gfx.eventMode = "static";
  gfx.cursor = "crosshair";
  gfx.x = centerX();
  gfx.y = centerY();
  app.stage.addChild(gfx);

  const node: TxNode = {
    txid, gfx, x: centerX(), y: centerY(),
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    firing: false, state: initialState, createdAt: Date.now(),
    vsize, amountBtc, feeRate,
  };
  nodes.set(txid, node);
  drawNode(node);

  gfx.on("pointerover", (e) => showTooltip(node, e.client.x, e.client.y));
  gfx.on("pointermove", (e) => moveTooltip(e.client.x, e.client.y));
  gfx.on("pointerout",  () => hideTooltip());
}

let lastBlockTime = 0;

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
    else if (msg.type === "stats_update") updateHud(msg);
    else if (msg.type === "price_update") updatePrice(msg);
    else if (msg.type === "sparkline_update") updateSparkline(msg.prices);
    else if (msg.type === "news_update") updateNewsTicker(msg.items);
  };
  ws.onclose = () => setTimeout(connectWebSocket, 3000);
}

fetchSnapshot();
connectWebSocket();
fetchStats(); // initial load only — subsequent updates arrive via stats_update WebSocket message

// --- HUD ---

function setText(id: string, value: string): void {
  (document.getElementById(id)!).textContent = value;
}

function utcTime(unixTs: number): string {
  return new Date(unixTs * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function updateMempoolSection(data: StatsPayload): void {
  setText("mempool-tx",  data.mempool_tx_count.toLocaleString() + " tx");
  setText("mempool-mb",  data.mempool_size_mb + " MB");
  setText("mempool-fee", (data.mempool_median_fee ?? "—") + " sat/vB");
  if (data.daily_tx_count !== undefined)
    setText("daily-tx-count", Number(data.daily_tx_count).toLocaleString());
}

function updatePeersSection(data: StatsPayload): void {
  setText("peers-count", String(data.peers));
  const dotsEl = document.getElementById("peers-dots")!;
  dotsEl.innerHTML = "";
  for (let i = 0; i < Math.min(data.peers, 10); i++) {
    const d = document.createElement("div");
    d.className = "peer-dot";
    dotsEl.appendChild(d);
  }
}

function updateNetworkSection(data: StatsPayload): void {
  if (data.hashrate_eh !== undefined) setText("hashrate",   data.hashrate_eh + " EH/s");
  if (data.difficulty  !== undefined) setText("difficulty", data.difficulty  + " T");
}

function updateLatestBlockSection(data: StatsPayload): void {
  const hash = data.best_block_hash ?? "";
  setText("latest-block-hash",
    hash ? hash.slice(0, 16) + "…" + hash.slice(-6) : "—");
  setText("latest-block-time",
    data.best_block_time ? utcTime(data.best_block_time) : "—");
}

function updateRecommendedFees(data: StatsPayload): void {
  const fmt = (v: number | null | undefined) => v != null ? v + " sat/vB" : "—";
  setText("fee-fast",   fmt(data.fee_fast));
  setText("fee-medium", fmt(data.fee_medium));
  setText("fee-slow",   fmt(data.fee_slow));
}

function updateHud(data: StatsPayload): void {
  lastBlockTime = data.best_block_time;
  setText("block-height", data.block_height.toLocaleString());
  updateMempoolSection(data);
  updatePeersSection(data);
  updateNetworkSection(data);
  updateLatestBlockSection(data);
  updateRecommendedFees(data);
  if (data.activity)      updateActivity(data.activity);
  if (data.fee_histogram) updateFeeHistogram(data.fee_histogram);
  if (data.supply)        updateSupply(data.supply);
}

const ACTIVITY_COLORS: Record<string, string> = {
  calibrating: "",
  normal:      "green",
  busy:        "orange",
  congested:   "red",
  quiet:       "blue",
};

function updateActivity(activity: ActivityPayload): void {
  const statusEl = document.getElementById("activity-status")!;
  statusEl.textContent = activity.status.charAt(0).toUpperCase() + activity.status.slice(1);
  statusEl.className = "hud-value " + (ACTIVITY_COLORS[activity.status] ?? "");

  const detailEl = document.getElementById("activity-detail")!;
  const deltaEl  = document.getElementById("activity-delta")!;

  if (activity.baseline !== null && activity.deviation_pct !== null) {
    detailEl.style.display = "";
    deltaEl.style.display  = "";
    document.getElementById("activity-baseline")!.textContent =
      activity.baseline.toLocaleString() + " tx";
    const sign = activity.deviation_pct > 0 ? "+" : "";
    document.getElementById("activity-pct")!.textContent =
      `${sign}${activity.deviation_pct}%`;
  } else {
    detailEl.style.display = "none";
    deltaEl.style.display  = "none";
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
    updateHud(await res.json() as StatsPayload);
  } catch {}
}

setInterval(updateBlockAge, 1000);

// --- price ---

function updatePrice(data: { usd: number | null; change_24h: number }): void {
  const priceEl  = document.getElementById("btc-price")!;
  const changeEl = document.getElementById("btc-change")!;
  priceEl.textContent = data.usd !== null
    ? "$" + Math.round(data.usd).toLocaleString()
    : "—";
  const sign  = data.change_24h >= 0 ? "+" : "";
  const color = data.change_24h >= 0 ? "#44cc88" : "#ff4444";
  changeEl.innerHTML = `<span style="color:${color}">${sign}${data.change_24h}% (24h)</span>`;
}

function updateSparkline(prices: number[]): void {
  if (prices.length < 2) return;
  const svg = document.getElementById("price-sparkline") as SVGElement | null;
  if (!svg) return;
  const W = 172, H = 32;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const step = W / (prices.length - 1);
  const pts = prices.map((p, i) =>
    `${(i * step).toFixed(1)},${(H - ((p - min) / range) * (H - 2) - 1).toFixed(1)}`
  ).join(" ");
  svg.innerHTML = `<polyline points="${pts}" fill="none" stroke="#f7931a" stroke-width="1.5" opacity="0.8"/>`;
  svg.style.display = "block";
}

// --- supply ---

function updateSupply(s: SupplyPayload): void {
  (document.getElementById("supply-btc")!).textContent =
    (s.circulating_btc / 1_000_000).toFixed(4) + "M BTC";
  (document.getElementById("supply-pct")!).textContent =
    s.percent_mined + "%";
  (document.getElementById("supply-subsidy")!).textContent =
    s.current_subsidy + " BTC";
  (document.getElementById("halving-block")!).textContent =
    "#" + s.next_halving_block.toLocaleString();
  (document.getElementById("halving-days")!).textContent =
    s.days_until_halving.toLocaleString() + " days";
}

// --- fee histogram ---

const HISTOGRAM_COLORS = ["#8888ff", "#4488ff", "#44cc88", "#f7931a", "#ff6633", "#ff3333", "#ff0000"];

function updateFeeHistogram(buckets: { label: string; count: number }[]): void {
  const bars = document.getElementById("fee-histogram")!;
  const labels = document.getElementById("fee-histogram-labels")!;
  bars.innerHTML = "";
  labels.innerHTML = "";

  const max = Math.max(...buckets.map(b => b.count), 1);
  const barWidth = Math.floor((172 - (buckets.length - 1) * 3) / buckets.length);

  buckets.forEach((b, i) => {
    const height = Math.max(2, Math.round((b.count / max) * 44));
    const bar = document.createElement("div");
    bar.style.cssText = `width:${barWidth}px;height:${height}px;background:${HISTOGRAM_COLORS[i]};border-radius:2px 2px 0 0;flex-shrink:0;`;
    bar.title = `${b.label} sat/vB: ${b.count.toLocaleString()} tx`;
    bars.appendChild(bar);

    const lbl = document.createElement("div");
    lbl.style.cssText = `width:${barWidth}px;font-size:8px;color:#445566;text-align:center;flex-shrink:0;overflow:hidden;`;
    lbl.textContent = b.label;
    labels.appendChild(lbl);
  });
}

// --- tooltip ---

const tooltipEl = document.getElementById("tooltip")!;

function showTooltip(node: TxNode, x: number, y: number): void {
  const txid = node.txid;
  document.getElementById("tt-txid")!.textContent =
    txid.slice(0, 10) + "…" + txid.slice(-8);
  document.getElementById("tt-fee")!.textContent =
    node.feeRate !== null ? node.feeRate + " sat/vB" : "unknown";
  document.getElementById("tt-amount")!.textContent =
    node.amountBtc !== null ? node.amountBtc + " BTC" : "unknown";
  document.getElementById("tt-vsize")!.textContent =
    node.vsize !== null ? node.vsize + " vbytes" : "unknown";
  tooltipEl.style.display = "block";
  moveTooltip(x, y);
}

function moveTooltip(x: number, y: number): void {
  const pad = 14;
  const tw = tooltipEl.offsetWidth;
  const th = tooltipEl.offsetHeight;
  const left = x + pad + tw > window.innerWidth ? x - tw - pad : x + pad;
  const top  = y + pad + th > window.innerHeight ? y - th - pad : y + pad;
  tooltipEl.style.left = left + "px";
  tooltipEl.style.top  = top  + "px";
}

function hideTooltip(): void {
  tooltipEl.style.display = "none";
}

// --- news ticker ---

let newsItems: { title: string; link: string; pub_ts: number | null }[] = [];
let newsIndex = 0;
let newsEl: HTMLElement | null = null;

function updateNewsTicker(items: { title: string; link: string; pub_ts: number | null }[]): void {
  newsItems = items;
  newsIndex = 0;
  renderNewsTicker();
}

function renderNewsTicker(): void {
  const container = document.getElementById("news-ticker");
  if (!container || newsItems.length === 0) return;
  container.innerHTML = "";
  const div = document.createElement("div");
  div.className = "news-item visible";
  const item = newsItems[newsIndex];
  const age = item.pub_ts ? `<span style="color:#556677;margin-left:8px">${newsTimeAgo(item.pub_ts)}</span>` : "";
  div.innerHTML = item.title + age;
  container.appendChild(div);
  newsEl = div;
}

setInterval(() => {
  if (newsItems.length === 0) return;
  newsIndex = (newsIndex + 1) % newsItems.length;
  if (newsEl) newsEl.classList.remove("visible");
  setTimeout(() => {
    renderNewsTicker();
  }, 650);
}, 8000);

