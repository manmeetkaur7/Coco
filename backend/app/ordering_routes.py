from fastapi import APIRouter, HTTPException, Query
from .catalog import get_restaurant, search_items
from .cart_service import summarize, create_draft
from .conversation_service import conversation_turn
from .ordering_schemas import RestaurantConfig, Catalog, Category, CatalogItem, Cart, CartSummary, DraftRequest, DraftResponse, TurnRequest, TurnResponse

router = APIRouter(prefix="/api/v1/restaurants/{restaurant_id}", tags=["Ordering"])

def resource(restaurant_id):
    try: return get_restaurant(restaurant_id)
    except KeyError as error: raise HTTPException(404, "Restaurant is not configured") from error

@router.get("", response_model=RestaurantConfig)
def configuration(restaurant_id: str):
    return resource(restaurant_id)[0]

@router.get("/menu", response_model=Catalog)
def menu(restaurant_id: str):
    return resource(restaurant_id)[1]

@router.get("/menu/categories", response_model=list[Category])
def categories(restaurant_id: str):
    return resource(restaurant_id)[1].categories

@router.get("/menu/items", response_model=list[CatalogItem])
def items(restaurant_id: str, q: str = Query(default="", max_length=200), category: str | None = None):
    return search_items(resource(restaurant_id)[1], q, category)

@router.get("/menu/items/{item_id}", response_model=CatalogItem)
def item(restaurant_id: str, item_id: str):
    result = next((item for item in resource(restaurant_id)[1].items if item.id == item_id), None)
    if not result: raise HTTPException(404, "Item is not in the verified catalog")
    return result

@router.post("/cart/validate", response_model=CartSummary)
@router.post("/orders/summary", response_model=CartSummary)
def cart_summary(restaurant_id: str, cart: Cart):
    restaurant, catalog = resource(restaurant_id)
    try: return summarize(cart, restaurant, catalog)
    except ValueError as error: raise HTTPException(422, str(error)) from error

@router.post("/order-drafts", response_model=DraftResponse)
def draft(restaurant_id: str, request: DraftRequest):
    restaurant, catalog = resource(restaurant_id)
    try: return create_draft(request, restaurant, catalog)
    except ValueError as error: raise HTTPException(422, str(error)) from error

@router.post("/assistant/turn", response_model=TurnResponse)
def turn(restaurant_id: str, request: TurnRequest):
    restaurant, catalog = resource(restaurant_id)
    try: return conversation_turn(request, restaurant, catalog)
    except ValueError as error: raise HTTPException(422, str(error)) from error
