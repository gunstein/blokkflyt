const API_BASE = "http://localhost:8000";
const WS_URL = "ws://localhost:8000/ws";

async function fetchSnapshot(): Promise<void> {
  const res = await fetch(`${API_BASE}/snapshot`);
  const data = await res.json();
  console.log(`[SNAPSHOT] ${data.mempool.length} transactions in mempool`);
}

function connectWebSocket(): void {
  const ws = new WebSocket(WS_URL);

  ws.onopen = () => console.log("[WS] Connected");

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "tx_seen") {
      console.log(`[TX] ${msg.txid}`);
    } else if (msg.type === "block_seen") {
      console.log(`[BLOCK] ${msg.hash}`);
    }
  };

  ws.onclose = () => {
    console.log("[WS] Disconnected — reconnecting in 3s...");
    setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = (err) => console.error("[WS] Error", err);
}

fetchSnapshot();
connectWebSocket();
