import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .restaurants import MENU, RESTAURANT
from .schemas import AssistantStatus, HealthResponse, Menu, Restaurant
from .ordering_routes import router as ordering_router
from .local_model import model_status
from .ordering_schemas import ModelState

app = FastAPI(title="Coco", version="0.3.0", description="Local conversational AI with verified demo ordering and an official-source catalog. Location pricing is unverified; legacy demo routes retain fictional samples.")
origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["Accept", "Content-Type"])

@app.get("/health", response_model=HealthResponse, tags=["Health"])
def health() -> HealthResponse:
    return HealthResponse()

@app.get("/api/v1/assistant/status", response_model=AssistantStatus, tags=["Assistant"])
def assistant_status() -> AssistantStatus:
    status = model_status()
    return AssistantStatus(conversation_engine="local-model" if status.mode == "local" else "deterministic", llm_available=status.available, message=status.message)

@app.get("/api/v1/assistant/model", response_model=ModelState, tags=["Assistant"])
def assistant_model_status():
    return model_status()

@app.get("/api/v1/restaurants/demo", response_model=Restaurant, tags=["Restaurants"])
def demo_restaurant() -> Restaurant:
    return RESTAURANT

@app.get("/api/v1/restaurants/demo/menu", response_model=Menu, tags=["Restaurants"])
def demo_menu() -> Menu:
    return MENU

app.include_router(ordering_router)
