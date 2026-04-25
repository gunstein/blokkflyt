import { type WsMessage, type StatsPayload } from "./types";
import { addTx, animateConfirmedTxs } from "./nodes";
import { addBlockSegment, getCurrentMiningStartTime, setCurrentMiningStartTime } from "./canvas";
import { updateHud, updatePrice, updateSparkline, updateNewsTicker, updateLatestBlock, setLastBlockTime } from "./hud";

const WS_URL = `${location.protocol.replace("http", "ws")}//${location.host}/ws`;

function onBlockSeen(
  confirmedTxids: string[], sizeKb: number, ntx: number,
  totalBtc: number, height: number, time: number, medianFee: number | null,
): void {
  const target = addBlockSegment(ntx, sizeKb, totalBtc, height, medianFee);
  animateConfirmedTxs(confirmedTxids, target.x, target.y);
  updateLatestBlock(ntx, sizeKb);
  if (time > 0) {
    setLastBlockTime(time);
    setCurrentMiningStartTime(time);
  }
}

export function connectWebSocket(): void {
  const statusEl = document.getElementById("connection-status")!;
  const ws       = new WebSocket(WS_URL);

  ws.onopen = () => { statusEl.style.display = "none"; };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data) as WsMessage;
    if      (msg.type === "tx_seen")          addTx(msg.txid, msg.fee_rate, msg.vsize, msg.amount_btc);
    else if (msg.type === "tx_batch")         for (const tx of msg.txs) addTx(tx.txid, tx.fee_rate, tx.vsize, tx.amount_btc);
    else if (msg.type === "block_seen")       onBlockSeen(msg.confirmed_txids, msg.size_kb, msg.ntx, msg.total_btc, msg.height, msg.time, msg.median_fee);
    else if (msg.type === "stats_update") {
      if (getCurrentMiningStartTime() === 0 && msg.best_block_time) setCurrentMiningStartTime(msg.best_block_time);
      updateHud(msg);
    }
    else if (msg.type === "price_update")     updatePrice(msg);
    else if (msg.type === "sparkline_update") updateSparkline(msg.prices);
    else if (msg.type === "news_update")      updateNewsTicker(msg.items);
  };

  ws.onclose = () => {
    statusEl.style.display = "block";
    setTimeout(connectWebSocket, 3000);
  };
}

export async function fetchStats(): Promise<void> {
  try {
    const res  = await fetch("/stats");
    const data = await res.json() as StatsPayload;
    if (getCurrentMiningStartTime() === 0 && data.best_block_time) setCurrentMiningStartTime(data.best_block_time);
    updateHud(data);
  } catch {}
}
