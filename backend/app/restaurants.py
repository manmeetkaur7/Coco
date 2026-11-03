"""In-memory sample repository; replace with PostgreSQL persistence in a later sprint."""
from .schemas import Menu, MenuItem, Restaurant

RESTAURANT = Restaurant(
    id="demo", name="Maison Olive", cuisine="Modern Mediterranean",
    description="Seasonal ingredients. Coastal inspiration. A place to linger.",
    address="123 Olive Lane · Fictional demo location", hours="Demo hours · Tue–Sun, 5–10 PM",
)
MENU = Menu(restaurant_id="demo", items=[
    MenuItem(id="burrata", name="Heirloom burrata", description="Garden tomatoes, basil oil, toasted sourdough", category="To begin", price=18, dietary_tags=["Vegetarian"]),
    MenuItem(id="salmon", name="Coastal salmon", description="Pan-seared salmon, lemon fregola, herb butter", category="From the kitchen", price=32, dietary_tags=[]),
    MenuItem(id="risotto", name="Wild mushroom risotto", description="Arborio rice, woodland mushrooms, aged parmesan", category="From the kitchen", price=26, dietary_tags=["Vegetarian"]),
    MenuItem(id="panna", name="Vanilla panna cotta", description="Poached berries, pistachio crumble", category="Something sweet", price=12, dietary_tags=["Vegetarian"]),
])
