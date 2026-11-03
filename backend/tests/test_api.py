from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    assert client.get("/health").json() == {"status": "ok", "service": "coco-api"}

def test_capabilities_are_honest():
    response = client.get("/api/v1/assistant/status")
    assert response.status_code == 200
    data = response.json()
    assert not any(data[key] for key in ["conversation_available", "voice_available", "avatar_available"])

def test_sample_restaurant_and_menu():
    restaurant = client.get("/api/v1/restaurants/demo").json()
    response = client.get("/api/v1/restaurants/demo/menu")
    assert response.status_code == 200
    menu = response.json()
    assert restaurant["sample_data"] and menu["sample_data"]
    assert menu["restaurant_id"] == restaurant["id"]
    assert len(menu["items"]) == 4
    assert all(item["price"] > 0 for item in menu["items"])
    assert len({item["id"] for item in menu["items"]}) == len(menu["items"])


def test_avatar_foundation_capabilities():
    data = client.get("/api/v1/assistant/status").json()
    assert data["avatar_mode"] == "portrait-foundation"
    assert data["avatar_state_preview_available"] is True
    assert not data["facial_animation_available"]
    assert not data["lip_sync_available"]

def test_local_cors():
    response = client.options("/health", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"

def test_unknown_origin_is_not_allowed():
    response = client.get("/health", headers={"Origin": "https://untrusted.example"})
    assert "access-control-allow-origin" not in response.headers
