export type TxState = "new" | "mempool" | "high_fee" | "selected";

export const HIGH_FEE_THRESHOLD = 10; // sat/vB

export function nodeRadius(amountBtc: number | null): number {
  if (amountBtc === null) return 3;
  if (amountBtc >= 100)  return 18;
  if (amountBtc >= 10)   return 13;
  if (amountBtc >= 1)    return 9;
  if (amountBtc >= 0.1)  return 6;
  if (amountBtc >= 0.01) return 4;
  return 2.5;
}

export function vsizeAlpha(vsize: number | null): number {
  if (vsize === null)  return 0.7;
  if (vsize >= 10000)  return 0.3;
  if (vsize >= 1000)   return 0.5;
  if (vsize >= 500)    return 0.7;
  if (vsize >= 200)    return 0.85;
  return 1.0;
}

export function stateColor(state: TxState): number {
  if (state === "new")      return 0xaa66ff;
  if (state === "high_fee") return 0xf7931a;
  if (state === "selected") return 0xffdd00;
  return 0x4488ff;
}

export function blockStrokeWidth(ntx: number): number {
  if (ntx <= 0) return 2;
  const MAX_TX = 6000;
  return Math.round(2 + (Math.min(ntx, MAX_TX) / MAX_TX) * 16);
}

export function timeAgo(unixTs: number): string {
  const secs = Math.floor(Date.now() / 1000) - unixTs;
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  return `${mins}m ${s}s ago`;
}

export function newsTimeAgo(unixTs: number): string {
  const secs = Math.floor(Date.now() / 1000) - unixTs;
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}
