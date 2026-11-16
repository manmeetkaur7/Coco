"""Local, versioned restaurant data. No scraped images, inferred prices or live ordering."""
import json
from pathlib import Path
from .ordering_schemas import Catalog, RestaurantConfig

DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "round-table.json"
document = json.loads(DATA_FILE.read_text(encoding="utf-8"))
RESTAURANT_CONFIG = RestaurantConfig.model_validate(document["restaurant"])
CATALOG = Catalog.model_validate(document["menu"])
if RESTAURANT_CONFIG.id != CATALOG.restaurant_id or RESTAURANT_CONFIG.menu_version != CATALOG.version:
    raise ValueError("Restaurant and catalog ID/version must match")

def get_restaurant(restaurant_id: str):
    if restaurant_id != RESTAURANT_CONFIG.id:
        raise KeyError("Restaurant is not configured")
    return RESTAURANT_CONFIG, CATALOG

def search_items(catalog: Catalog, query: str = "", category: str | None = None):
    words = query.casefold().split()
    return [item for item in catalog.items
            if (not category or item.category_id == category)
            and all(word in " ".join([item.name, item.description or "", *item.ingredients, *item.aliases]).casefold()
                    for word in words)]
