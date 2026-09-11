#!/usr/bin/env python3
import json
import urllib.request
import time

ENDPOINT = "https://synchronocities-ai.sheshnarayan-iyer.workers.dev/chat"

body = json.dumps({"query": "What are the main themes that organize the whole corpus?"}).encode()
req = urllib.request.Request(
    ENDPOINT, data=body,
    headers={
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
    method="POST",
)
t0 = time.monotonic()
try:
    with urllib.request.urlopen(req, timeout=300) as resp:
        print(f"status={resp.status} ttfb={time.monotonic()-t0:.2f}s")
        total_bytes = 0
        while True:
            chunk = resp.read(8192)
            if not chunk:
                break
            total_bytes += len(chunk)
        print(f"total={time.monotonic()-t0:.2f}s bytes={total_bytes}")
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")
