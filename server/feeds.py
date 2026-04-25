import asyncio
import logging
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

import httpx

import state
from ws import broadcast

logger = logging.getLogger(__name__)

NEWS_RSS_URL             = "https://bitcoinmagazine.com/feed"
NEWS_FETCH_INTERVAL      = 900    # 15 minutes
PRICE_FETCH_INTERVAL     = 60     # 1 minute
SPARKLINE_FETCH_INTERVAL = 21600  # 6 hours

COINGECKO_PRICE_URL = (
    "https://api.coingecko.com/api/v3/simple/price"
    "?ids=bitcoin&vs_currencies=usd&include_24hr_change=true"
)
COINGECKO_SPARKLINE_URL = (
    "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart"
    "?vs_currency=usd&days=7&interval=daily"
)
COINGECKO_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; blokkflyt)"}


async def sample_price() -> None:
    while True:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(COINGECKO_PRICE_URL, headers=COINGECKO_HEADERS)
            btc = resp.json().get("bitcoin", {})
            state.cached_price = {
                "usd":        btc.get("usd"),
                "change_24h": round(float(btc.get("usd_24h_change") or 0), 2),
            }
            await broadcast({"type": "price_update", **state.cached_price})
        except Exception as e:
            logger.warning("price fetch failed: %s", e)
        await asyncio.sleep(PRICE_FETCH_INTERVAL)


async def sample_sparkline() -> None:
    while True:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(COINGECKO_SPARKLINE_URL, headers=COINGECKO_HEADERS)
            prices = [p[1] for p in resp.json().get("prices", [])]
            if prices:
                state.cached_sparkline = [round(p, 2) for p in prices]
                await broadcast({"type": "sparkline_update", "prices": state.cached_sparkline})
        except Exception as e:
            logger.warning("sparkline fetch failed: %s", e)
        await asyncio.sleep(SPARKLINE_FETCH_INTERVAL)


async def sample_news() -> None:
    while True:
        try:
            headers = {"User-Agent": "Mozilla/5.0 (compatible; RSS reader)"}
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(NEWS_RSS_URL, headers=headers, follow_redirects=True)
            root  = ET.fromstring(resp.text)
            items = []
            for item in root.findall(".//item")[:5]:
                title = (item.findtext("title") or "").strip()
                if not title:
                    continue
                pub_ts   = None
                pub_date = (item.findtext("pubDate") or "").strip()
                if pub_date:
                    try:
                        pub_ts = int(parsedate_to_datetime(pub_date).timestamp())
                    except Exception as e:
                        logger.debug("pubDate parse failed for %r: %s", pub_date, e)
                items.append({
                    "title":  title,
                    "link":   (item.findtext("link") or "").strip(),
                    "pub_ts": pub_ts,
                })
            if items and items != state.cached_news:
                state.cached_news = items
                await broadcast({"type": "news_update", "items": state.cached_news})
                logger.info("%d headlines updated", len(state.cached_news))
        except Exception as e:
            logger.warning("news fetch failed: %s", e)
        await asyncio.sleep(NEWS_FETCH_INTERVAL)
