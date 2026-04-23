import os

from dotenv import load_dotenv

load_dotenv()

BITCOIN_HOST         = os.getenv("BITCOIN_RPC_HOST", "localhost")
BITCOIN_RPC_USER     = os.getenv("BITCOIN_RPC_USER")
BITCOIN_RPC_PASSWORD = os.getenv("BITCOIN_RPC_PASSWORD")
BITCOIN_RPC_PORT     = os.getenv("BITCOIN_RPC_PORT", "8332")
ZMQ_BLOCK_PORT       = int(os.getenv("ZMQ_BLOCK_PORT", "28332"))
ZMQ_TX_PORT          = int(os.getenv("ZMQ_TX_PORT", "28333"))
ALLOWED_ORIGINS      = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174").split(",")
]
