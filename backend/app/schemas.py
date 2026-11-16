from typing import Literal
from pydantic import BaseModel, Field

class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: str = "coco-api"

class AssistantStatus(BaseModel):
    name: str = "Coco"
    phase: str = "Sprint 3 · Voice ordering"
    conversation_available: bool = True
    conversation_engine: str = "deterministic"
    llm_available: bool = False
    browser_voice_integration: bool = True
    avatar_available: bool = False
    voice_available: bool = False
    avatar_mode: Literal["portrait-foundation"] = "portrait-foundation"
    avatar_state_preview_available: bool = True
    facial_animation_available: bool = False
    lip_sync_available: bool = False
    message: str = "Deterministic English demo ordering with browser-dependent voice. No LLM, facial animation, or real order submission."

class Restaurant(BaseModel):
    id: str
    name: str
    cuisine: str
    description: str
    address: str
    hours: str
    sample_data: Literal[True] = True

class MenuItem(BaseModel):
    id: str
    name: str
    description: str
    category: str
    price: float = Field(ge=0)
    dietary_tags: list[str]

class Menu(BaseModel):
    restaurant_id: str
    currency: Literal["USD"] = "USD"
    sample_data: Literal[True] = True
    items: list[MenuItem]
