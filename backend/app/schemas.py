from typing import Literal
from pydantic import BaseModel, Field

class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: str = "coco-api"

class AssistantStatus(BaseModel):
    name: str = "Coco"
    phase: str = "Sprint 2 · Avatar foundation"
    conversation_available: bool = False
    avatar_available: bool = False
    voice_available: bool = False
    avatar_mode: Literal["portrait-foundation"] = "portrait-foundation"
    avatar_state_preview_available: bool = True
    facial_animation_available: bool = False
    lip_sync_available: bool = False
    message: str = "Local portrait state previews are available. Facial animation, voice, and AI conversations are not connected."

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
