import asyncio
import time

import zmq
import zmq.asyncio

import state
from config import BITCOIN_HOST, ZMQ_BLOCK_PORT, ZMQ_TX_PORT
from rpc import rpc, get_tx_info, get_block_info
from stats import _refresh_stats
from ws import broadcast

zmq_ctx = zmq.asyncio.Context()


async def flush_tx_buffer() -> None:
    """Drain tx_buffer every 200ms and broadcast as a single tx_batch."""
    while True:
        await asyncio.sleep(0.2)
        if state.tx_buffer:
            batch, state.tx_buffer = state.tx_buffer, []
            await broadcast({"type": "tx_batch", "txs": batch})


async def listen_txs() -> None:
    while True:
        try:
            sock = zmq_ctx.socket(zmq.SUB)
            sock.connect(f"tcp://{BITCOIN_HOST}:{ZMQ_TX_PORT}")
            sock.setsockopt_string(zmq.SUBSCRIBE, "hashtx")
            print("[ZMQ] Listening for transactions...")
            while True:
                parts = await sock.recv_multipart()
                txid  = parts[1].hex()
                info  = await get_tx_info(txid)
                tx    = {"txid": txid, "entry_time": int(time.time()), **info}
                state.mempool[txid] = tx
                state.tx_buffer.append(tx)  # buffer; flushed by flush_tx_buffer
        except Exception as e:
            print(f"[ZMQ] tx listener crashed: {e}, reconnecting in 5s...")
            await asyncio.sleep(5)


async def listen_blocks() -> None:
    ZMQ_TIMEOUT = 300  # 5 minutes; check for missed blocks if nothing arrives

    while True:
        sock = zmq_ctx.socket(zmq.SUB)
        try:
            sock.connect(f"tcp://{BITCOIN_HOST}:{ZMQ_BLOCK_PORT}")
            sock.setsockopt_string(zmq.SUBSCRIBE, "hashblock")
            print("[ZMQ] Listening for blocks...")
            while True:
                block_hash = None
                try:
                    parts      = await asyncio.wait_for(sock.recv_multipart(), timeout=ZMQ_TIMEOUT)
                    block_hash = parts[1].hex()
                except asyncio.TimeoutError:
                    print("[ZMQ] 5 min timeout — checking node for missed blocks...")
                    try:
                        chain_info  = await asyncio.to_thread(lambda: rpc().getblockchaininfo())
                        node_height = int(chain_info.get("blocks", 0))
                        our_height  = state.cached_stats["block_height"] if state.cached_stats else 0
                        if node_height > our_height:
                            print(f"[ZMQ] Missed block! node={node_height} us={our_height} — fetching")
                            block_hash = chain_info.get("bestblockhash", "")
                        else:
                            print("[ZMQ] No missed block, slow mining — continuing to wait")
                    except Exception as e:
                        print(f"[ZMQ] RPC check failed: {e}")
                        break  # force reconnect

                if block_hash:
                    info = await get_block_info(block_hash)
                    for txid in info["confirmed_txids"]:
                        state.mempool.pop(txid, None)
                    print(f"[BLOCK] ntx={info['ntx']} size={info['size_kb']}KB btc={info['total_btc']}")
                    block_event = {
                        "type": "block_seen", "hash": block_hash,
                        **info, "prev_block_time": state.last_block_time,
                    }
                    state.last_block_time = info["time"]
                    state.recent_blocks.append(block_event)
                    await broadcast(block_event)
                    try:
                        await _refresh_stats()
                    except Exception as e:
                        print(f"[STATS] post-block refresh failed: {e}")

        except Exception as e:
            print(f"[ZMQ] block listener crashed: {e}, reconnecting in 5s...")
            await asyncio.sleep(5)
        finally:
            sock.close()
