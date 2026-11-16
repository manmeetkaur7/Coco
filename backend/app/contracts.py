"""Legacy/future provider and persistence ports; Sprint 3 drafts are stateless."""
from typing import Protocol
from pydantic import BaseModel, Field
from .schemas import Menu
from .ordering_schemas import Catalog, RestaurantConfig, DraftResponse

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

class CatalogRepository(Protocol):
    def get_catalog(self, restaurant_id: str) -> tuple[RestaurantConfig, Catalog]: ...

class DraftStore(Protocol):
    def save(self, draft: DraftResponse) -> str: ...
