// Wake Lock API (not yet in all TS lib versions)
export interface WakeLockSentinel extends EventTarget {
  release(): Promise<void>;
}
export interface WakeLockNavigator {
  wakeLock: { request(type: "screen"): Promise<WakeLockSentinel> };
}

// WebSocket message types
export interface TxPayload {
  txid: string;
  fee_rate: number | null;
  vsize: number | null;
  amount_btc: number | null;
}
export interface TxBatchMsg   { type: "tx_batch";        txs: TxPayload[] }
export interface TxSeenMsg    { type: "tx_seen";         txid: string; fee_rate: number | null; vsize: number | null; amount_btc: number | null }
export interface BlockSeenMsg { type: "block_seen";      hash: string; height: number; ntx: number; size_kb: number; total_btc: number; median_fee: number | null; time: number; prev_block_time: number; confirmed_txids: string[] }
export interface StatsMsg     { type: "stats_update" }
export interface PriceMsg     { type: "price_update";    usd: number; change_24h: number }
export interface SparklineMsg { type: "sparkline_update"; prices: number[] }
export interface NewsMsg      { type: "news_update";     items: { title: string; link: string; pub_ts: number }[] }
export type WsMessage = TxBatchMsg | TxSeenMsg | BlockSeenMsg | StatsMsg & StatsPayload | PriceMsg | SparklineMsg | NewsMsg;

export interface ActivityPayload {
  status: string;
  deviation_pct: number | null;
  baseline: number | null;
}

export interface SupplyPayload {
  circulating_btc: number;
  percent_mined: number;
  current_subsidy: number;
  next_halving_block: number;
  blocks_until_halving: number;
  days_until_halving: number;
}

export interface StatsPayload {
  client_count?: number;
  oldest_mempool_sec?: number | null;
  block_height: number;
  best_block_hash: string;
  best_block_time: number;
  mempool_tx_count: number;
  mempool_size_mb: number;
  mempool_median_fee: number | null;
  peers: number;
  hashrate_eh?: number;
  difficulty?: number;
  blocks_until_adj?: number | null;
  adj_pct_estimate?: number | null;
  daily_tx_count?: number;
  fee_fast?: number | null;
  fee_medium?: number | null;
  fee_slow?: number | null;
  activity?: ActivityPayload;
  fee_histogram?: { label: string; count: number }[];
  supply?: SupplyPayload;
}
