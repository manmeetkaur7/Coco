import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .restaurants import MENU, RESTAURANT
from .schemas import AssistantStatus, HealthResponse, Menu, Restaurant

app = FastAPI(title="Coco", version="0.1.0", description="Sprint 1 foundation API. Restaurant and menu data are fictional samples.")
origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET"], allow_headers=["Accept", "Content-Type"])

@app.get("/health", response_model=HealthResponse, tags=["Health"])
def health() -> HealthResponse:
    return HealthResponse()

@app.get("/api/v1/assistant/status", response_model=AssistantStatus, tags=["Assistant"])
def assistant_status() -> AssistantStatus:
    return AssistantStatus()

@app.get("/api/v1/restaurants/demo", response_model=Restaurant, tags=["Restaurants"])
def demo_restaurant() -> Restaurant:
    return RESTAURANT

@app.get("/api/v1/restaurants/demo/menu", response_model=Menu, tags=["Restaurants"])
def demo_menu() -> Menu:
    return MENU
