"""Authoritative validation/pricing. Client-supplied names or prices are never accepted."""
import hashlib
import json
from decimal import Decimal, ROUND_HALF_UP
from uuid import uuid4
from .ordering_schemas import Cart, Catalog, RestaurantConfig, CartSummary, SummaryLine, DraftRequest, DraftResponse

def summarize(cart: Cart, restaurant: RestaurantConfig, menu: Catalog) -> CartSummary:
    if cart.restaurant_id != restaurant.id or menu.restaurant_id != restaurant.id:
        raise ValueError("Cart restaurant does not match the selected restaurant")
    items = {item.id: item for item in menu.items}
    toppings = {option.id: option for option in menu.toppings}
    add_ons = {option.id: option for option in menu.add_ons}
    lines = []
    warnings = []
    for line in cart.lines:
        item = items.get(line.item_id)
        if not item or item.availability == "unavailable":
            raise ValueError(f"Item {line.item_id} is not available in this menu")
        variations = {option.id: option for option in item.variations}
        variation = variations.get(line.variation_id)
        if variations and not variation:
            raise ValueError(f"Choose a verified size/variation for {item.name}")
        if not variations and line.variation_id is not None:
            raise ValueError(f"{item.name} has no verified size/variation")
        if variation and variation.availability == "unavailable":
            raise ValueError("This variation is unavailable")
        if not set(line.added_topping_ids).issubset(item.topping_ids):
            raise ValueError("A topping is not supported for this item")
        if not set(line.removed_topping_ids).issubset(item.included_topping_ids):
            raise ValueError("Only a documented included topping can be removed")
        if set(line.added_topping_ids) & set(item.included_topping_ids):
            raise ValueError("This topping is already included; extra portions are unverified")
        if not set(line.add_on_ids).issubset(item.add_on_ids):
            raise ValueError("This add-on is not verified")
        selected = [toppings.get(key) for key in line.added_topping_ids] + [add_ons.get(key) for key in line.add_on_ids]
        if any(option is None or option.availability == "unavailable" for option in selected):
            raise ValueError("A customization is unavailable")
        price = variation.price if variation else item.price
        if any(option.price is None for option in selected) or (line.removed_topping_ids and not item.removal_adjustment_verified):
            price = None
        elif price is not None:
            price += sum((option.price for option in selected), Decimal(0))
        if price is None:
            warnings.append(f"{item.name}: price/customization charges are unverified.")
        if item.availability == "unknown" or (variation and variation.availability == "unknown") or any(option.availability == "unknown" for option in selected):
            warnings.append(f"{item.name}: availability/customizations need location confirmation.")
        lines.append(SummaryLine(
            line=line, name=item.name, variation_name=variation.name if variation else None,
            added_toppings=[toppings[key].name for key in line.added_topping_ids],
            removed_toppings=[toppings[key].name for key in line.removed_topping_ids],
            add_ons=[add_ons[key].name for key in line.add_on_ids],
            unit_price=price, line_total=price * line.quantity if price is not None else None,
        ))
    subtotal = sum((line.line_total for line in lines), Decimal(0)) if all(line.line_total is not None for line in lines) else None
    tax = (subtotal * restaurant.tax.rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if subtotal is not None and restaurant.tax.rate is not None else None
    total = subtotal + tax if subtotal is not None and tax is not None else None
    if restaurant.tax.rate is None:
        warnings.append("Tax is unverified; a final total cannot be quoted.")
    if restaurant.location_id is None:
        warnings.append("No restaurant location is configured. This is a local demo draft only.")
    parts = []
    for entry in lines:
        text = f"{entry.line.quantity} × {entry.variation_name + ' ' if entry.variation_name else ''}{entry.name}"
        if entry.added_toppings: text += "; add " + ", ".join(entry.added_toppings)
        if entry.removed_toppings: text += "; remove " + ", ".join(entry.removed_toppings)
        if entry.add_ons: text += "; extras " + ", ".join(entry.add_ons)
        parts.append(text)
    readback = ". ".join(parts) if parts else "Your cart is empty."
    readback += f". Total: {total:.2f} USD." if total is not None else " Prices or tax are unverified, so I cannot quote a final total."
    token_data = {"cart": cart.model_dump(mode="json"), "version": menu.version, "lines": [line.model_dump(mode="json") for line in lines], "tax": str(restaurant.tax.rate)}
    token = hashlib.sha256(json.dumps(token_data, sort_keys=True).encode()).hexdigest()
    return CartSummary(lines=lines, subtotal=subtotal, tax=tax, total=total, warnings=list(dict.fromkeys(warnings)), review_token=token, readback=readback)

def create_draft(request: DraftRequest, restaurant: RestaurantConfig, menu: Catalog) -> DraftResponse:
    summary = summarize(request.cart, restaurant, menu)
    if not request.cart.lines:
        raise ValueError("Add an item before creating an order draft")
    if request.confirm and request.review_token != summary.review_token:
        raise ValueError("Review the current order before confirming this demo draft")
    return DraftResponse(
        id=str(uuid4()), status="demo_confirmed" if request.confirm else "draft", summary=summary,
        message="Demo draft confirmed locally. No restaurant order was placed and no payment was processed." if request.confirm else "Review this draft before demo confirmation. Nothing has been submitted.",
    )
