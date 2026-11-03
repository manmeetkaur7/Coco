"""Future domain ports. No provider, persistence, order, or AI behavior is active."""
from typing import Protocol
from pydantic import BaseModel, Field
from .schemas import Menu

class OrderLine(BaseModel):
    menu_item_id: str
    quantity: int = Field(gt=0)

class OrderDraft(BaseModel):
    restaurant_id: str
    lines: list[OrderLine] = Field(min_length=1)

class MenuRepository(Protocol):
    def get_menu(self, restaurant_id: str) -> Menu: ...

class OrderRepository(Protocol):
    def save_draft(self, draft: OrderDraft) -> str: ...

class AIProvider(Protocol):
    async def respond(self, messages: list[dict[str, str]]) -> str: ...
