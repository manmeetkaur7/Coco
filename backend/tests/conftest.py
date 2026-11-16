import pytest


@pytest.fixture(autouse=True)
def isolated_model(monkeypatch):
    """Regular tests never depend on a loaded model or its variable latency.

    Model tests explicitly enable and inject plans; real-model evals use the
    separate scripts/evaluate_local_model.py HTTP harness without this fixture.
    """
    monkeypatch.setenv("COCO_MODEL_ENABLED", "false")
    monkeypatch.setenv("COCO_FAST_ORDERING", "false")
