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
