import { type StatsPayload, type ActivityPayload, type SupplyPayload } from "./types";
import { timeAgo, newsTimeAgo } from "./utils";

let lastBlockTime = 0;

export function setLastBlockTime(t: number): void {
  lastBlockTime = t;
}

function setText(id: string, value: string): void {
  document.getElementById(id)!.textContent = value;
}

function utcTime(unixTs: number): string {
  return new Date(unixTs * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

// --- HUD sections ---

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function updateMempoolSection(data: StatsPayload): void {
  setText("mempool-tx",  data.mempool_tx_count.toLocaleString() + " tx");
  setText("mempool-mb",  data.mempool_size_mb + " MB");
  setText("mempool-fee", (data.mempool_median_fee ?? "—") + " sat/vB");
  if (data.daily_tx_count !== undefined)
    setText("daily-tx-count", Number(data.daily_tx_count).toLocaleString());
  if (data.oldest_mempool_sec != null)
    setText("mempool-oldest", formatDuration(data.oldest_mempool_sec));
}

function updatePeersSection(data: StatsPayload): void {
  setText("peers-count", String(data.peers));
  if (data.client_count !== undefined) setText("client-count", String(data.client_count));
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
  if (data.blocks_until_adj != null)
    setText("adj-blocks", data.blocks_until_adj.toLocaleString() + " blk");
  if (data.adj_pct_estimate != null) {
    const pct   = data.adj_pct_estimate;
    const sign  = pct > 0 ? "+" : "";
    const color = pct > 0 ? "#ff4444" : "#44cc88";
    document.getElementById("adj-pct")!.innerHTML =
      `<span style="color:${color}">${sign}${pct}%</span>`;
  }
}

function updateLatestBlockSection(data: StatsPayload): void {
  const hash = data.best_block_hash ?? "";
  setText("latest-block-hash", hash ? hash.slice(0, 16) + "…" + hash.slice(-6) : "—");
  setText("latest-block-time", data.best_block_time ? utcTime(data.best_block_time) : "—");
}

function updateRecommendedFees(data: StatsPayload): void {
  const fmt = (v: number | null | undefined) => v != null ? v + " sat/vB" : "—";
  setText("fee-fast",   fmt(data.fee_fast));
  setText("fee-medium", fmt(data.fee_medium));
  setText("fee-slow",   fmt(data.fee_slow));
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
  statusEl.className   = "hud-value " + (ACTIVITY_COLORS[activity.status] ?? "");

  const detailEl = document.getElementById("activity-detail")!;
  const deltaEl  = document.getElementById("activity-delta")!;

  if (activity.baseline !== null && activity.deviation_pct !== null) {
    detailEl.style.display = "";
    deltaEl.style.display  = "";
    setText("activity-baseline", activity.baseline.toLocaleString() + " tx");
    const sign = activity.deviation_pct > 0 ? "+" : "";
    setText("activity-pct", `${sign}${activity.deviation_pct}%`);
  } else {
    detailEl.style.display = "none";
    deltaEl.style.display  = "none";
  }
}

const HISTOGRAM_COLORS = ["#8888ff", "#4488ff", "#44cc88", "#f7931a", "#ff6633", "#ff3333", "#ff0000"];

function updateFeeHistogram(buckets: { label: string; count: number }[]): void {
  const bars   = document.getElementById("fee-histogram")!;
  const labels = document.getElementById("fee-histogram-labels")!;
  bars.innerHTML = "";
  labels.innerHTML = "";

  const max      = Math.max(...buckets.map(b => b.count), 1);
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

function updateSupply(s: SupplyPayload): void {
  setText("supply-btc",    (s.circulating_btc / 1_000_000).toFixed(4) + "M BTC");
  setText("supply-pct",    s.percent_mined + "%");
  setText("supply-subsidy", s.current_subsidy + " BTC");
  setText("halving-block", "#" + s.next_halving_block.toLocaleString());
  setText("halving-days",  s.days_until_halving.toLocaleString() + " days");
}

export function updateLatestBlock(ntx: number, sizeKb: number): void {
  setText("latest-block-ntx",  ntx.toLocaleString() + " tx");
  setText("latest-block-size", sizeKb + " KB");
}

export function updateHud(data: StatsPayload): void {
  setLastBlockTime(data.best_block_time);
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

// --- price ---

export function updatePrice(data: { usd: number | null; change_24h: number }): void {
  document.getElementById("btc-price")!.textContent = data.usd !== null
    ? "$" + Math.round(data.usd).toLocaleString()
    : "—";
  const sign  = data.change_24h >= 0 ? "+" : "";
  const color = data.change_24h >= 0 ? "#44cc88" : "#ff4444";
  document.getElementById("btc-change")!.innerHTML =
    `<span style="color:${color}">${sign}${data.change_24h}% (24h)</span>`;
}

export function updateSparkline(prices: number[]): void {
  if (prices.length < 2) return;
  const svg = document.getElementById("price-sparkline") as SVGElement | null;
  if (!svg) return;
  const W = 172, H = 32;
  const min   = Math.min(...prices);
  const max   = Math.max(...prices);
  const range = max - min || 1;
  const step  = W / (prices.length - 1);
  const pts   = prices.map((p, i) =>
    `${(i * step).toFixed(1)},${(H - ((p - min) / range) * (H - 2) - 1).toFixed(1)}`
  ).join(" ");
  svg.innerHTML = `<polyline points="${pts}" fill="none" stroke="#f7931a" stroke-width="1.5" opacity="0.8"/>`;
  svg.style.display = "block";
}

// --- tooltip ---

const tooltipEl = document.getElementById("tooltip")!;

export function showTooltip(
  txid: string, feeRate: number | null, amountBtc: number | null, vsize: number | null,
  x: number, y: number,
): void {
  document.getElementById("tt-tx")!.style.display = "";
  document.getElementById("tt-block")!.style.display = "none";
  setText("tt-txid",   txid.slice(0, 10) + "…" + txid.slice(-8));
  setText("tt-fee",    feeRate   !== null ? feeRate   + " sat/vB" : "unknown");
  setText("tt-amount", amountBtc !== null ? amountBtc + " BTC"    : "unknown");
  setText("tt-vsize",  vsize     !== null ? vsize     + " vbytes"  : "unknown");
  tooltipEl.style.display = "block";
  moveTooltip(x, y);
}

export function showBlockTooltip(
  height: number, ntx: number, sizeKb: number, totalBtc: number,
  medianFee: number | null,
  x: number, y: number,
): void {
  document.getElementById("tt-tx")!.style.display = "none";
  document.getElementById("tt-block")!.style.display = "";
  setText("tt-block-height", "#" + height.toLocaleString());
  setText("tt-block-ntx",    ntx.toLocaleString() + " tx");
  setText("tt-block-size",   sizeKb + " KB");
  setText("tt-block-btc",    totalBtc + " BTC");
  setText("tt-block-fee",    medianFee != null ? medianFee + " sat/vB" : "—");
  tooltipEl.style.display = "block";
  moveTooltip(x, y);
}

export function moveTooltip(x: number, y: number): void {
  const pad  = 14;
  const tw   = tooltipEl.offsetWidth;
  const th   = tooltipEl.offsetHeight;
  const left = x + pad + tw > window.innerWidth  ? x - tw - pad : x + pad;
  const top  = y + pad + th > window.innerHeight ? y - th - pad : y + pad;
  tooltipEl.style.left = left + "px";
  tooltipEl.style.top  = top  + "px";
}

export function hideTooltip(): void {
  tooltipEl.style.display = "none";
}

// --- news ticker ---

let newsItems: { title: string; link: string; pub_ts: number | null }[] = [];
let newsIndex = 0;
let activeNewsEl: HTMLElement | null = null;

export function updateNewsTicker(items: { title: string; link: string; pub_ts: number | null }[]): void {
  newsItems = items;
  newsIndex = 0;
  renderNewsItem();
}

function renderNewsItem(): void {
  const container = document.getElementById("news-ticker");
  if (!container || newsItems.length === 0) return;
  container.innerHTML = "";
  const item = newsItems[newsIndex];
  const age  = item.pub_ts
    ? `<span style="color:#556677;margin-left:8px">${newsTimeAgo(item.pub_ts)}</span>`
    : "";
  const div = document.createElement("div");
  div.className = "news-item visible";
  div.innerHTML = item.title + age;
  container.appendChild(div);
  activeNewsEl = div;
}

setInterval(() => {
  if (newsItems.length === 0) return;
  newsIndex = (newsIndex + 1) % newsItems.length;
  if (activeNewsEl) activeNewsEl.classList.remove("visible");
  setTimeout(renderNewsItem, 650);
}, 8000);

// --- block age ticker ---

setInterval(() => {
  if (!lastBlockTime) return;
  const el = document.getElementById("last-block-age");
  if (el) el.textContent = timeAgo(lastBlockTime);
}, 1000);
