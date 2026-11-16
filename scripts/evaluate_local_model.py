"""Real loopback HTTP evaluation, separate from injected-plan unit tests.

Run after starting Coco's local model and backend. Creates only local demo drafts.
Saves evidence under ignored private-assets, never a transcript on a cloud service.
"""
import json
from pathlib import Path
import time
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8000/api/v1/restaurants/round-table/assistant/turn"


def evaluate():
    results = []
    state = {"cart": {"restaurant_id": "round-table", "lines": []}, "context": {}}
    for text in ["Could you give me a second?", "I think I'm ready.", "I'd like a medium King Arthur Supreme.", "Could we go with the large instead?", "That will do it, thanks.", "yes"]:
        started = time.monotonic()
        body = json.dumps({"text": text, "conversation_active": True, **state}).encode()
        with urlopen(Request(BASE, data=body, headers={"Content-Type": "application/json"}), timeout=50) as response:
            result = json.load(response)
        results.append({"customer": text, "seconds": round(time.monotonic() - started, 2), **result})
        state = {"cart": result["cart"], "context": result["context"]}
        print(json.dumps({"customer": text, "engine": result["engine"], "reply": result["reply"], "seconds": results[-1]["seconds"]}), flush=True)
    checks = {
        "real_model_social": any(entry["engine"] == "local-model" for entry in results[:2]),
        "patient_wait": "time" in results[0]["reply"].lower() and "?" not in results[0]["reply"],
        "medium_added_once": len(results[2]["cart"]["lines"]) == 1 and results[2]["cart"]["lines"][0]["variation_id"] == "medium",
        "real_model_natural_correction": results[3]["engine"] == "local-model" and results[3]["cart"]["lines"][0]["variation_id"] == "large",
        "review_waits": results[4]["draft"] is None and bool(results[4]["context"]["review_token"]),
        "demo_only": results[5]["draft"] is not None and results[5]["draft"]["status"] == "demo_confirmed" and not results[5]["draft"]["submitted_to_restaurant"] and not results[5]["draft"]["payment_processed"],
        "unknown_total": results[5]["summary"]["total"] is None,
    }
    (ROOT / "private-assets" / "local-model-evaluation.json").write_text(json.dumps({"checks": checks, "turns": results}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(checks), flush=True)
    if not all(checks.values()): raise SystemExit(1)


if __name__ == "__main__": evaluate()
