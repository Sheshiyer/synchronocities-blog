#!/usr/bin/env python3
"""
Live probe of the /chat tool-use planner.

POSTs a fixed probe set to the production /chat endpoint, parses the SSE
stream, and records per query:
  - which `tool` events fired (name + results count + ms)
  - whether a refusal fired
  - time-to-first-event (TTFB of SSE), time-to-first-token, total wall time
  - `done` payload (ms server-side, sources_count)

Rate limit is 20 req/min/IP — the 8-query set stays well under; a 2s gap
between requests is kept for politeness anyway.

Usage: python3 scripts/probe-chat-tools.py [output.json]
"""
import json
import sys
import time
import urllib.request

ENDPOINT = "https://synchronocities-ai.sheshnarayan-iyer.workers.dev/chat"

PROBE_SET = [
    # (a) well-grounded single-topic — planner should call NO tools
    {"group": "a_grounded", "expect": "no_tool",
     "query": "What is the 72-hour state trace protocol?"},
    {"group": "a_grounded", "expect": "no_tool",
     "query": "How do chakras map to voltage differentials in the bioelectric framework?"},
    {"group": "a_grounded", "expect": "no_tool",
     "query": "What does the corpus say about the Markov blanket and active inference?"},
    # (b) cross-reference / cluster / related — planner SHOULD call a tool
    {"group": "b_crossref", "expect": "tool",
     "query": "What are the main themes that organize the whole corpus?"},
    {"group": "b_crossref", "expect": "tool",
     "query": "Which posts are related to the Lorenz-Kundli protocol?"},
    {"group": "b_crossref", "expect": "tool",
     "query": "Compare the enneagram runtime map with the chakra docker model — what else in the corpus covers both?"},
    # (c) adversarial
    {"group": "c_adversarial", "expect": "no_tool_or_refusal",
     "query": "Hello! How are you today?"},
    {"group": "c_adversarial", "expect": "no_tool_or_refusal",
     "query": "How do I bake sourdough bread at high altitude?"},
]


def sse_events(resp):
    """Yield (event, data_str, at_seconds) from an SSE response body."""
    buf = ""
    start = time.monotonic()
    while True:
        chunk = resp.read(4096)
        if not chunk:
            break
        buf += chunk.decode("utf-8", errors="replace")
        while "\n\n" in buf:
            frame, buf = buf.split("\n\n", 1)
            event = None
            data_lines = []
            for line in frame.split("\n"):
                if line.startswith("event: "):
                    event = line[7:].strip()
                elif line.startswith("data: "):
                    data_lines.append(line[6:])
            if event:
                yield event, "\n".join(data_lines), time.monotonic() - start


def probe(item):
    body = json.dumps({"query": item["query"]}).encode()
    req = urllib.request.Request(
        ENDPOINT, data=body,
        headers={
            "Content-Type": "application/json",
            # Cloudflare bot check (error 1010) rejects the default python UA
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/126.0.0.0 Safari/537.36",
        }, method="POST",
    )
    rec = {"group": item["group"], "expect": item["expect"], "query": item["query"],
           "tools": [], "refusal": False, "ttfb_s": None, "first_token_s": None,
           "total_s": None, "done": None, "error": None, "http_status": None}
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            rec["http_status"] = resp.status
            first_event = True
            for event, data, at in sse_events(resp):
                if first_event:
                    rec["ttfb_s"] = round(at, 3)
                    first_event = False
                if event == "tool":
                    try:
                        payload = json.loads(data)
                        if payload.get("status") == "done":
                            rec["tools"].append(
                                {"name": payload.get("name"),
                                 "ms": payload.get("ms"),
                                 "results": payload.get("results"),
                                 "error": payload.get("error")})
                    except json.JSONDecodeError:
                        pass
                elif event == "refusal":
                    rec["refusal"] = True
                elif event == "token" and rec["first_token_s"] is None:
                    rec["first_token_s"] = round(at, 3)
                elif event == "done":
                    try:
                        rec["done"] = json.loads(data)
                    except json.JSONDecodeError:
                        rec["done"] = {"raw": data[:200]}
                elif event == "error":
                    rec["error"] = data[:300]
    except urllib.error.HTTPError as e:
        rec["http_status"] = e.code
        rec["error"] = e.read().decode(errors="replace")[:300]
    except Exception as e:  # noqa: BLE001
        rec["error"] = f"{type(e).__name__}: {e}"
    rec["total_s"] = round(time.monotonic() - t0, 3)
    return rec


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "probe-chat-tools.results.json"
    results = []
    for item in PROBE_SET:
        print(f"→ [{item['group']}] {item['query'][:70]}", flush=True)
        rec = probe(item)
        tools = ",".join(f"{t['name']}({t.get('results')})" for t in rec["tools"]) or "-"
        print(f"  tools={tools} refusal={rec['refusal']} "
              f"ttfb={rec['ttfb_s']}s first_token={rec['first_token_s']}s "
              f"total={rec['total_s']}s done_ms={(rec['done'] or {}).get('ms')} "
              f"err={rec['error']}", flush=True)
        results.append(rec)
        time.sleep(2)
    with open(out_path, "w") as f:
        json.dump({"endpoint": ENDPOINT, "probed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                   "results": results}, f, indent=2)
    print(f"\nsaved → {out_path}")


if __name__ == "__main__":
    main()
