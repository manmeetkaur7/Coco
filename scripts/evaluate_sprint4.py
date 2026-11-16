"""Evaluate Sprint 4 against the real local model on an isolated loopback port."""
from collections import Counter
import json
import os
from pathlib import Path
import subprocess
import sys
from time import monotonic, sleep
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
PORT = 18081


def evaluate(client):
    state = {"cart": {"lines": []}, "context": {}}
    turns = [
        "I think I'm ready.",
        "Could you give me a second?",
        "medium King Arthur Supreme and small create your own with mushrooms",
        "Could we go with the large instead?",
        "Make the first pizza large",
        "That's everything",
        "No",
        "Make the second one medium",
        "That's all",
        "Yes",
    ]
    results = []
    for turn in turns:
        started = monotonic()
        response = client.post("/api/v1/restaurants/round-table/assistant/turn", json={
            **state, "text": turn, "conversation_active": True,
        })
        response.raise_for_status()
        result = response.json()
        state = {key: result[key] for key in state}
        results.append(result)
        print(json.dumps({
            "turn": turn, "seconds": round(monotonic() - started, 3),
            "reply": result["reply"], "engine": result["engine"],
            "inference_ms": result["inference_ms"], "fallback_reason": result["fallback_reason"],
            "cart": [(line["item_id"], line["variation_id"], line["quantity"]) for line in state["cart"]["lines"]],
        }), flush=True)
    model_turns = [result for result in results if result["inference_ms"] is not None]
    print("model attempts / fallback reasons:", len(model_turns), dict(Counter(result["fallback_reason"] for result in model_turns)), flush=True)
    draft = results[-1]["draft"]
    assert [(line["item_id"], line["variation_id"], line["quantity"]) for line in state["cart"]["lines"]] == [
        ("king-arthur", "large", 1), ("create-your-own", "medium", 1),
    ]
    assert state["cart"]["lines"][1]["added_topping_ids"] == ["mushrooms"]
    assert any(result["engine"] == "local-model" for result in model_turns), "No real model proposal was accepted"
    assert results[5]["context"]["review_token"] and not results[5]["draft"]
    assert not results[6]["context"]["review_token"] and not results[6]["draft"]
    assert draft and draft["status"] == "demo_confirmed" and not draft["submitted_to_restaurant"] and not draft["payment_processed"]
    assert results[-1]["summary"]["total"] is None
    assert results[3]["engine"] == "local-model" and results[3]["cart"]["lines"][1]["variation_id"] == "large", "Flexible correction did not use real inference"


def main():
    sys.path.insert(0, str(ROOT / "backend"))
    os.environ.update(COCO_MODEL_ENABLED="true", COCO_LOCAL_MODEL_URL=f"http://127.0.0.1:{PORT}",
                      COCO_LOCAL_MODEL_NAME="coco-local", COCO_FAST_ORDERING="true")
    from fastapi.testclient import TestClient
    from app.main import app
    assets = ROOT / "private-assets" / "local-model"
    started = monotonic()
    process = subprocess.Popen([
        str(assets / "runtime" / "llama-server.exe"), "-m", str(assets / "coco-qwen3-1.7b-q4_k_m.gguf"),
        "--alias", "coco-local", "--host", "127.0.0.1", "--port", str(PORT),
        "--ctx-size", "4096", "--threads", "4", "--threads-batch", "4", "--parallel", "1",
        "--cache-ram", "64", "--reasoning-budget", "0", "--no-webui", "--log-disable",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        while monotonic() - started < 40:
            if process.poll() is not None:
                raise RuntimeError(f"Model process exited ({process.returncode})")
            try:
                with urlopen(f"http://127.0.0.1:{PORT}/health", timeout=1) as response:
                    if json.load(response)["status"] == "ok":
                        break
            except OSError:
                sleep(0.25)
        else:
            raise RuntimeError("Model startup timed out")
        print(f"Cold process ready in {monotonic() - started:.2f}s", flush=True)
        with TestClient(app) as client:
            assert client.get("/api/v1/assistant/model").json()["available"]
            evaluate(client)
    finally:
        process.terminate()
        process.wait(timeout=10)


if __name__ == "__main__":
    main()
