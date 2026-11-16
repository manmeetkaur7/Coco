from decimal import Decimal
from typing import Literal, Annotated
from pydantic import BaseModel, ConfigDict, Field, model_validator

Availability = Literal["available", "unavailable", "unknown"]

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

class Priced(StrictModel):
    price: Decimal | None = Field(default=None, ge=0, max_digits=8, decimal_places=2)
    price_source_url: str | None = None

    @model_validator(mode="after")
    def price_requires_source(self):
        if self.price is not None and not self.price_source_url:
            raise ValueError("A verified price source is required")
        return self

class Option(Priced):
    id: str
    name: str
    aliases: list[str] = Field(default_factory=list)
    source_url: str
    availability: Availability = "unknown"

class Category(StrictModel):
    id: str
    name: str
    note: str | None = None

class CatalogItem(Priced):
    id: str
    name: str
    category_id: str
    kind: Literal["pizza", "side", "wings", "salad", "dessert", "beverage"]
    description: str | None = None
    ingredients: list[str] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    source_url: str
    availability: Availability = "unknown"
    variations: list[Option] = Field(default_factory=list)
    topping_ids: list[str] = Field(default_factory=list)
    included_topping_ids: list[str] = Field(default_factory=list)
    add_on_ids: list[str] = Field(default_factory=list)
    removal_adjustment_verified: bool = False

class TaxConfig(StrictModel):
    rate: Decimal | None = Field(default=None, ge=0, le=1)
    source_url: str | None = None

    @model_validator(mode="after")
    def tax_requires_source(self):
        if self.rate is not None and not self.source_url:
            raise ValueError("Tax rate requires a verified source")
        return self

class RestaurantConfig(StrictModel):
    id: str
    name: str
    address: str | None = None
    location_id: str | None = None
    menu_version: str
    currency: Literal["USD"] = "USD"
    source_url: str
    tax: TaxConfig = Field(default_factory=TaxConfig)
    promotions: list[dict[str, str]] = Field(default_factory=list)
    missing_data: list[str]
    demo_only: Literal[True] = True

class Catalog(StrictModel):
    restaurant_id: str
    version: str
    verified_on: str
    source_urls: list[str]
    categories: list[Category]
    toppings: list[Option]
    add_ons: list[Option] = Field(default_factory=list)
    items: list[CatalogItem]

    @model_validator(mode="after")
    def valid_references(self):
        for group in [self.items, self.categories, self.toppings, self.add_ons]:
            if len({entry.id for entry in group}) != len(group):
                raise ValueError("Catalog IDs must be unique within each group")
        categories = {entry.id for entry in self.categories}
        toppings = {entry.id for entry in self.toppings}
        extras = {entry.id for entry in self.add_ons}
        for item in self.items:
            if item.category_id not in categories or not set(item.topping_ids) <= toppings or not set(item.add_on_ids) <= extras or not set(item.included_topping_ids) <= set(item.topping_ids):
                raise ValueError("Catalog has an unknown category or customization reference")
            if len({entry.id for entry in item.variations}) != len(item.variations):
                raise ValueError("Item variation IDs must be unique")
        return self

class CartLine(StrictModel):
    line_id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    item_id: str
    quantity: int = Field(default=1, strict=True, ge=1, le=20)
    variation_id: str | None = None
    added_topping_ids: list[str] = Field(default_factory=list, max_length=20)
    removed_topping_ids: list[str] = Field(default_factory=list, max_length=20)
    add_on_ids: list[str] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def unique_options(self):
        for values in [self.added_topping_ids, self.removed_topping_ids, self.add_on_ids]:
            if len(values) != len(set(values)):
                raise ValueError("Duplicate customization options")
        return self

class Cart(StrictModel):
    restaurant_id: str = "round-table"
    lines: list[CartLine] = Field(default_factory=list, max_length=25)

    @model_validator(mode="after")
    def unique_lines(self):
        if len({line.line_id for line in self.lines}) != len(self.lines):
            raise ValueError("Duplicate cart line IDs")
        return self

class SummaryLine(StrictModel):
    line: CartLine
    name: str
    variation_name: str | None
    added_toppings: list[str]
    removed_toppings: list[str]
    add_ons: list[str]
    unit_price: Decimal | None
    line_total: Decimal | None

class CartSummary(StrictModel):
    lines: list[SummaryLine]
    currency: Literal["USD"] = "USD"
    subtotal: Decimal | None
    tax: Decimal | None
    total: Decimal | None
    warnings: list[str]
    review_token: str
    readback: str

class DraftRequest(StrictModel):
    cart: Cart
    confirm: bool = False
    review_token: str | None = None

class DraftResponse(StrictModel):
    id: str
    status: Literal["draft", "demo_confirmed"]
    summary: CartSummary
    submitted_to_restaurant: Literal[False] = False
    payment_processed: Literal[False] = False
    message: str

class PendingItem(StrictModel):
    item_id: str | None = None
    quantity: int = Field(default=1, strict=True, ge=1, le=20)
    variation_id: str | None = None
    topping_ids: list[str] = Field(default_factory=list, max_length=20)
    choice_item_ids: list[str] = Field(default_factory=list, max_length=25)

class PendingEdit(StrictModel):
    size: Literal["personal", "small", "medium", "large", "extra large", "x large"]


class OrderingContext(StrictModel):
    pending_edit: PendingEdit | None = None
    duplicate_line_id: str | None = None
    pending: PendingItem | None = None
    target_line_id: str | None = None
    review_token: str | None = None
    memory: "SessionMemory" = Field(default_factory=lambda: SessionMemory())

class SessionMessage(StrictModel):
    role: Literal["customer", "assistant"]
    text: str = Field(max_length=500)

class SessionMemory(StrictModel):
    recent: list[SessionMessage] = Field(default_factory=list, max_length=12)
    preferences: list[Literal["vegetarian", "no_mushrooms", "no_onions"]] = Field(default_factory=list, max_length=3)
    notes: list[Annotated[str, Field(max_length=120)]] = Field(default_factory=list, max_length=5)

class ModelState(StrictModel):
    available: bool = False
    mode: Literal["local", "fallback", "disabled"] = "fallback"
    name: str = "coco-local"
    message: str = "Local model unavailable. Using the verified ordering fallback."

class TurnRequest(StrictModel):
    text: str = Field(min_length=1, max_length=500)
    conversation_active: bool = False
    language: Literal["en-US", "pa-IN", "hi-IN"] = "en-US"
    cart: Cart
    context: OrderingContext = Field(default_factory=OrderingContext)

class TurnResponse(StrictModel):
    reply: str
    session_action: Literal["continue", "end"] = "continue"
    language: Literal["en-US"] = "en-US"
    engine: Literal["deterministic", "local-model"] = "deterministic"
    model: ModelState = Field(default_factory=ModelState)
    inference_ms: float | None = None
    fallback_reason: Literal["timeout", "busy", "unavailable", "invalid", "rejected"] | None = None
    cart: Cart
    context: OrderingContext
    summary: CartSummary
    draft: DraftResponse | None = None
