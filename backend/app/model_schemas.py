"""The local model proposes one action; it never returns an authoritative cart."""
from typing import Literal
from pydantic import Field
from .ordering_schemas import StrictModel


class ConversationPlan(StrictModel):
    intent: Literal["chat", "clarify", "recommend", "ingredients", "add", "size", "quantity", "add_topping", "remove_topping", "remove_item", "clear", "review", "confirm", "total", "end"]
    speech: str = Field(default="", max_length=300)
    item_id: str | None = Field(default=None, max_length=64)
    variation_id: str | None = Field(default=None, max_length=64)
    quantity: int | None = Field(default=None, strict=True, ge=1, le=20)
    target_line_id: str | None = Field(default=None, max_length=64)
    topping_id: str | None = Field(default=None, max_length=64)
    recommendations: list[str] = Field(default_factory=list, max_length=3)


class UnsafeModelAction(ValueError):
    """A valid-shaped proposal is not sufficiently grounded to execute."""
