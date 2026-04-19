import asyncio

import zmq
import zmq.asyncio

ctx = zmq.asyncio.Context()

print("[INIT] Connecting block socket to tcp://192.168.0.104:28332")
block_sock = ctx.socket(zmq.SUB)
block_sock.connect("tcp://192.168.0.104:28332")
block_sock.setsockopt_string(zmq.SUBSCRIBE, "hashblock")
print("[INIT] Subscribed to hashblock")

print("[INIT] Connecting tx socket to tcp://192.168.0.104:28333")
tx_sock = ctx.socket(zmq.SUB)
tx_sock.connect("tcp://192.168.0.104:28333")
tx_sock.setsockopt_string(zmq.SUBSCRIBE, "hashtx")
print("[INIT] Subscribed to hashtx")


async def read_blocks() -> None:
    print("[BLOCK] Waiting for messages...")
    while True:
        try:
            parts = await asyncio.wait_for(block_sock.recv_multipart(), timeout=10.0)
            topic = parts[0].decode()
            body = parts[1]
            print(f"[BLOCK] topic={topic} hash={body.hex()}")
        except asyncio.TimeoutError:
            print("[BLOCK] No message in 10s (still waiting...)")


async def read_txs() -> None:
    print("[TX] Waiting for messages...")
    while True:
        try:
            parts = await asyncio.wait_for(tx_sock.recv_multipart(), timeout=10.0)
            topic = parts[0].decode()
            body = parts[1]
            print(f"[TX]    topic={topic} txid={body.hex()}")
        except asyncio.TimeoutError:
            print("[TX] No message in 10s (still waiting...)")


async def main() -> None:
    print("[MAIN] Starting...")
    await asyncio.gather(
        read_blocks(),
        read_txs(),
    )


if __name__ == "__main__":
    asyncio.run(main())
