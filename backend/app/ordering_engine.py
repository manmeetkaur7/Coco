"""Small, deterministic English grammar. This is not an LLM or a restaurant POS."""
import re
from uuid import uuid4
from .cart_service import summarize, create_draft
from .conversation_intents import conversation_intent, is_order_completion, pending_pizza_candidates, menu_phrases, normalize_utterance as normalized
from .ordering_schemas import Cart, CartLine, Catalog, RestaurantConfig, TurnRequest, TurnResponse, OrderingContext, PendingItem, DraftRequest

def matches(text, options):
    found = []
    occupied = []
    candidates = []
    for option in options:
        for phrase in menu_phrases(option):
            if phrase:
                for match in re.finditer(r"\b" + re.escape(phrase) + r"\b", text):
                    candidates.append((len(phrase), option, match.span()))
    for _, option, span in sorted(candidates, key=lambda x: -x[0]):
        if option.id not in [item.id for item in found] and not any(start <= span[0] and end >= span[1] for start, end in occupied):
            found.append(option)
            occupied.append(span)
    return found

def handle_turn(request: TurnRequest, restaurant: RestaurantConfig, menu: Catalog) -> TurnResponse:
    cart = request.cart.model_copy(deep=True)
    context = request.context.model_copy(deep=True)
    summary = summarize(cart, restaurant, menu)
    text = normalized(request.text)
    if re.search(r"\b(?:another|additional)\b", text):
        text = re.sub(r"\b(?:another|additional)\b", "a", text)
    # Bounded correction normalization; never strip arbitrary modifiers.
    correction = re.fullmatch(r"(?:actually )?(?:make|change) (?:that|it)(?: to)? (?:a )?(personal|small|medium|large|extra large|x large)(?: please)?", text)
    if correction:
        text = "make it " + correction[1]

    def answer(reply, draft=None, session_action="continue"):
        return TurnResponse(reply=reply, cart=cart, context=context, summary=summarize(cart, restaurant, menu), draft=draft, session_action=session_action)

    def commit(lines, reply):
        nonlocal cart, context
        old_target = context.target_line_id
        adding = len(lines) > len(cart.lines)
        try:
            candidate = Cart(restaurant_id=restaurant.id, lines=lines)
            summarize(candidate, restaurant, menu)
        except ValueError as error:
            return answer(str(error))
        cart = candidate
        selected = old_target if not adding and any(line.line_id == old_target for line in lines) else (lines[-1].line_id if lines else None)
        context = OrderingContext(target_line_id=selected)
        return answer(reply)

    def target():
        if context.target_line_id:
            return next((line for line in cart.lines if line.line_id == context.target_line_id), None)
        return cart.lines[0] if len(cart.lines) == 1 else None

    if re.search(r"[\u0900-\u097f\u0a00-\u0a7f]", request.text):
        return answer("Punjabi and Hindi speech locales are experimental. Ordering and responses currently work in English only; please type an English request.")
    if not text:
        return answer("Please type an English ordering request.")
    intent = conversation_intent(text, menu, active=request.conversation_active)
    if intent:
        if intent.invalidate_review:
            context.review_token = None
        if intent.session_action == "end":
            context = OrderingContext()
        return answer(intent.text, session_action=intent.session_action)
    pending_choice = context.pending
    if pending_choice and pending_choice.choice_item_ids:
        if text in {"yes", "yes please", "that one", "yes that one"}:
            if len(pending_choice.choice_item_ids) != 1:
                return answer("Which of the suggested pizzas would you like? Please say its full menu name; I have not added an item.")
            selected = next((item for item in menu.items if item.id == pending_choice.choice_item_ids[0] and item.kind == "pizza"), None)
            if selected is None:
                pending_choice.choice_item_ids = []
                return answer("That suggestion is no longer in the verified menu. Which pizza would you like instead?")
            # Internal resolution only; customer transcript text is unchanged.
            text = normalized(selected.name)
        elif text in {"no", "no thanks", "no thank you", "nope"}:
            pending_choice.choice_item_ids = []
            return answer("Of course. Which pizza would you like instead? I kept your requested size and quantity; nothing has been added.")
    if re.search(r"\b(and|then)\b", text):
        return answer("Please send one ordering action at a time so I do not guess.")
    if text in ["start over", "clear cart", "clear my cart"]:
        return commit([], "Your local cart is cleared. What would you like to order?")
    if text in ["remove the last item", "remove last item", "delete last item"]:
        return commit(cart.lines[:-1], "Removed the last draft item." if cart.lines else "Your cart is already empty.")
    if re.search(r"\b(total|how much|subtotal)\b", text):
        return answer(summary.readback)
    done_adding = is_order_completion(text) or text in {"no", "no thanks", "no thank you", "nope", "no nothing else"}
    if text in {"no", "no thanks", "no thank you", "nope"} and context.review_token:
        context.review_token = None
        return answer("I have not confirmed your draft. What would you like to change? Your cart is unchanged.")
    confirmation = text in ["confirm my order", "confirm order", "confirm demo", "yes", "yes please", "review order", "read back my order"]
    if (done_adding or confirmation) and context.pending_edit:
        context.review_token = None
        return answer("Which cart item should I change before we review the order?")
    if (done_adding or confirmation) and context.pending:
        context.review_token = None
        return answer("One item still needs a menu choice or size. Please finish choosing it, or say 'start over'. Your draft is not confirmed.")
    if done_adding or confirmation:
        if not cart.lines: return answer("Your cart is empty. Add an item before reviewing a demo order.")
        if not done_adding and text not in ["review order", "read back my order"] and context.review_token == summary.review_token:
            draft = create_draft(DraftRequest(cart=cart, confirm=True, review_token=context.review_token), restaurant, menu)
            context.review_token = None
            return answer(draft.message, draft)
        context.review_token = summary.review_token
        return answer("Let me confirm your order. " + summary.readback + " Is this correct? Say 'yes' to confirm this demo draft, or 'no' to make changes. This does not place a restaurant order.")
    selection = re.fullmatch(r"edit item (\d+)", text)
    if selection:
        number = int(selection[1])
        if not 1 <= number <= len(cart.lines): return answer("That cart item does not exist.")
        context.target_line_id = cart.lines[number - 1].line_id
        return answer(f"Item {number} selected. Tell me one topping, size, or quantity change.")
    if re.search(r"\bitem \d+\b", text):
        return answer("Select that item first with 'edit item N', then send one change.")
    if "$" in request.text or re.search(r"\b(under|budget|dollars|dollar)\b", text):
        return answer("Prices are unverified, so I cannot match a budget or quoted price. No item was added.")
    if re.search(r"\b(giant|jumbo|huge|xxl)\b|\b\d+\s*(inch|inches)\b", text):
        return answer("Please choose a size by its verified menu name. I will not guess a size or quantity.")
    if context.pending and not context.pending.item_id:
        candidates = pending_pizza_candidates(text, menu)
        if candidates:
            if len(candidates) > 25:
                return answer("That name is too broad. Please say the full name of one pizza from the menu. Nothing has been added.")
            context.pending.choice_item_ids = [item.id for item in candidates]
            context.review_token = None
            size = next((option.name for item in menu.items for option in item.variations if option.id == context.pending.variation_id), context.pending.variation_id)
            kept = f" I kept your requested {size} size and quantity {context.pending.quantity}." if size else f" I kept quantity {context.pending.quantity}."
            if len(candidates) == 1:
                return answer(f"Would you like {candidates[0].name}?" + kept + " Say yes or its full name to choose it; nothing has been added yet.")
            return answer("Which pizza did you mean: " + "; ".join(item.name for item in candidates) + "? Please say the full menu name." + kept + " Nothing has been added.")
    found_items = matches(text, menu.items)
    if re.search(r"\b(what s in|what is in|ingredients|contains)\b", text):
        if len(found_items) > 1: return answer("Which single pizza would you like ingredient information about?")
        line = target()
        item = found_items[0] if found_items else next((item for item in menu.items if line and item.id == line.item_id), None)
        if not item: return answer("Name a pizza or select a cart item first.")
        details = ", ".join(item.ingredients) if item.ingredients else item.description
        return answer(f"{item.name}: {details or 'a detailed ingredient list has not been verified'}. Allergen and cross-contact safety must be checked with the restaurant.")
    if found_items and re.search(r"\b(remove|delete|take off|cancel|do not|don t|not)\b", text):
        return answer("No item was added or removed. To remove a whole item, use its cart remove button or say 'remove the last item'.")
    if "extra cheese" in text:
        return answer("Extra-cheese options and charges are not verified in this menu. I have not changed the cart.")
    if re.search(r"\b(half|halves|crust|sauce|gluten free)\b", text):
        return answer("Half-and-half, crust, sauce changes and dietary guarantees are not verified in this catalog. I have not changed the cart.")
    if re.search(r"\bonions?\b", text) and not re.search(r"\b(red|yellow) onions?\b", text):
        return answer("Do you mean yellow onions or red onions? Please specify add or remove and the onion type.")
    found_toppings = matches(text, menu.toppings)
    if not found_items and found_toppings and re.match(r"(add|remove|take off)\b", text):
        remaining = text
        for option in found_toppings:
            for alias in sorted([option.name, *option.aliases], key=len, reverse=True):
                remaining = re.sub(r"\b" + re.escape(normalized(alias)) + r"\b", " ", remaining)
        if re.sub(r"\b(add|remove|take off|please|some|the)\b|\s", "", remaining):
            return answer("That topping request contains an unverified option or unsupported change. No cart changes were made; please change one listed topping at a time.")
    if "with " in text:
        tail = text.split("with ", 1)[1]
        for option in found_toppings:
            for alias in [option.name, *option.aliases]:
                tail = re.sub(r"\b" + re.escape(normalized(alias)) + r"\b", " ", tail)
        if re.sub(r"\b(and|please|some)\b|\s", "", tail):
            return answer("One of those toppings is not verified in this menu. No item was added; choose toppings from the menu controls.")
    if len(found_items) > 1:
        return answer("Please choose one pizza at a time. I found more than one menu item in that request.")
    if context.pending is None and not found_items and re.match(r"(add|remove|take off)\b", text) and found_toppings:
        line = target()
        if not line: return answer("Select a cart item for this change, or add a pizza first.")
        if len(found_toppings) != 1: return answer("Please change one topping at a time.")
        option = found_toppings[0]
        item = next(item for item in menu.items if item.id == line.item_id)
        if option.id == "pepperoni" and "mini-pepperoni" in item.included_topping_ids and "classic pepperoni" not in text:
            return answer("Classic or mini pepperoni? Please specify 'classic pepperoni' or 'mini pepperoni' for this pizza.")
        add = text.startswith("add")
        update = line.model_copy(deep=True)
        if add:
            if option.id in item.included_topping_ids:
                if option.id not in update.removed_topping_ids: return answer("That topping is already included. Extra portions are unverified.")
                update.removed_topping_ids.remove(option.id)
            elif option.id not in update.added_topping_ids: update.added_topping_ids.append(option.id)
        elif option.id in update.added_topping_ids: update.added_topping_ids.remove(option.id)
        elif option.id in item.included_topping_ids:
            if option.id not in update.removed_topping_ids: update.removed_topping_ids.append(option.id)
        else: return answer("That topping is not included or added to this item.")
        return commit([update if entry.line_id == line.line_id else entry for entry in cart.lines], f"{'Added' if add else 'Removed'} {option.name} in your draft. Local availability and charges still need confirmation.")
    all_variations = {option.id: option for item in menu.items for option in item.variations}
    found_sizes = matches(text, list(all_variations.values()))
    if "extra large" in text: found_sizes = [all_variations["x-large"]]
    if len(found_sizes) > 1: return answer("Please choose a single size or variation.")
    changing = re.match(r"(make it|change|set|size)\b", text)
    if changing and context.pending is None and not found_items:
        remainder = text
        for option in found_sizes:
            for phrase in sorted(menu_phrases(option), key=len, reverse=True):
                remainder = re.sub(r"\b" + re.escape(phrase) + r"\b", " ", remainder)
        if re.sub(r"\b(make|it|change|set|size|quantity|to|the|a|an|please|\d+)\b|\s", "", remainder):
            return answer("Please give me one listed size or quantity change. I have not changed your cart.")
        line = target()
        if not line: return answer("Select a cart item before changing its size or quantity.")
        update = line.model_copy(deep=True)
        qty = re.search(r"\b(?:quantity|make it) (?:to )?(\d+)\b", text)
        if found_sizes and re.search(r"\b\d+\b", text):
            return answer("Please change the size and quantity separately. No cart changes were made.")
        if found_sizes: update.variation_id = found_sizes[0].id
        elif qty:
            if not 1 <= int(qty[1]) <= 20: return answer("Quantity must be between 1 and 20.")
            update.quantity = int(qty[1])
        else: return answer("That size or change is not verified. Use the menu's size choices or quantity control.")
        acknowledgement = f"Of course. I've changed that to a {found_sizes[0].name.lower()}." if found_sizes else f"I've changed the quantity to {update.quantity}."
        return commit([update if entry.line_id == line.line_id else entry for entry in cart.lines], acknowledgement)
    if "drink" in text and not found_items:
        return answer("The verified beverage listing is '20 OZ Bottles'. Brands, flavors and prices are unverified. Say 'add 20 oz bottle' for a generic demo draft item, or choose it in the menu.")
    is_pizza_request = bool(re.search(r"\bpizzas?\b", text))
    if not found_items and not is_pizza_request and context.pending is None:
        return answer("I'm not sure whether you'd like menu help or a change to your draft. Could you name a listed menu item, ask 'what can you do', or tell me one change? I have not changed your cart.")
    if context.pending and found_items and (
        (context.pending.item_id and found_items[0].id != context.pending.item_id)
        or (not context.pending.item_id and found_items[0].kind != "pizza")
    ):
        return answer("Please finish the pending item choice first, or say 'start over'. I have not replaced it or added a different item.")
    pending = context.pending or PendingItem()
    pending = pending.model_copy(deep=True)
    if found_items:
        pending.item_id = found_items[0].id
        pending.choice_item_ids = []
    item = next((item for item in menu.items if item.id == pending.item_id), None)
    words = {word: index for index, word in enumerate(["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen","twenty"])}
    quantity_text = text
    # Numbers inside a product name (20 OZ) or portion choice (6 count) are not quantities.
    for option in ([item] if item else []) + found_sizes:
        for alias in sorted(menu_phrases(option), key=len, reverse=True):
            quantity_text = re.sub(r"\b" + re.escape(alias) + r"\b", " ", quantity_text)
    quantities = re.findall(r"\b(\d+|" + "|".join(words) + r")\b", quantity_text)
    if len(quantities) > 1:
        return answer("Please specify one quantity and one item at a time; I have not guessed a quantity.")
    if quantities:
        value = quantities[0]
        quantity = words.get(value, int(value) if value.isdigit() else 1)
        if not 1 <= quantity <= 20: return answer("Quantity must be between 1 and 20; no item was added.")
        pending.quantity = quantity
    # Reject unmatched additions/modifiers instead of silently ordering only
    # the part we recognized (for example a bottle plus an unverified brand).
    remaining = text
    options = found_items + found_sizes + found_toppings
    aliases = sorted({alias for option in options for alias in menu_phrases(option)}, key=len, reverse=True)
    for alias in aliases:
        remaining = re.sub(r"\b" + re.escape(alias) + r"\b", " ", remaining)
    remaining = re.sub(r"\b(\d+|" + "|".join(words) + r")\b", " ", remaining)
    if re.sub(r"\b(i|we|would|like|want|can|could|may|get|have|please|add|a|an|the|some|of|pizza|pizzas|with|size|to|order|me|for|my|d|ll)\b|\s", "", remaining):
        return answer("I could not verify every item or option in that request. No cart changes were made; please use one listed menu item and its supported options.")
    if found_sizes: pending.variation_id = found_sizes[0].id
    if "pepperoni" in text and not item:
        pending.topping_ids = ["pepperoni"]
        context.pending = pending
        context.review_token = None
        return answer("Do you mean Double Play Pepperoni Pizza, or Create Your Own Pizza with pepperoni? I kept your quantity/size while you choose.")
    if re.search(r"\b(without|no|extra)\b", text):
        return answer("Please add the base item first, then make one customization at a time. No item was added.")
    if "with " in text:
        tail = text.split("with ", 1)[1]
        for option in found_toppings:
            for alias in [option.name, *option.aliases]: tail = re.sub(r"\b" + re.escape(normalized(alias)) + r"\b", " ", tail)
        if re.sub(r"\b(and|please|some)\b|\s", "", tail):
            return answer("One of those toppings is not verified in this menu. No item was added; choose toppings from the menu controls.")
    for option in found_toppings:
        if option.id not in pending.topping_ids: pending.topping_ids.append(option.id)
    context.pending = pending
    context.review_token = None
    if not item:
        return answer("Which pizza would you like? Name a specialty pizza or say 'create your own'. For different pizzas, add them separately.")
    if item.availability == "unavailable":
        pending.item_id = None
        pending.choice_item_ids = []
        return answer("That item is currently marked unavailable; it was not added.")
    variation = next((option for option in item.variations if option.id == pending.variation_id), None)
    if item.variations and (variation is None or variation.availability == "unavailable"):
        available = [option.name for option in item.variations if option.availability != "unavailable"]
        requested = f"Your requested {variation.name if variation else pending.variation_id} size is not supported or is marked unavailable. " if pending.variation_id else ""
        return answer(requested + f"What size/variation for {item.name}? " + ("Choose " + ", ".join(available) + "." if available else "No variations can be selected right now; choose another item or start over."))
    if found_sizes and not item.variations:
        return answer(f"{item.name} has no verified size/variation choices. No item was added; please order it without an unsupported size.")
    if not item.variations: pending.variation_id = None
    added = [key for key in pending.topping_ids if key not in item.included_topping_ids]
    line = CartLine(line_id=str(uuid4()), item_id=item.id, quantity=pending.quantity, variation_id=pending.variation_id, added_topping_ids=added)
    duplicate = next((existing for existing in cart.lines if existing.model_dump(exclude={"line_id"}) == line.model_dump(exclude={"line_id"})), None)
    if duplicate and not re.search(r"\b(another|additional)\b", normalized(request.text)):
        context = request.context.model_copy(deep=True)
        context.pending = None
        context.review_token = None
        context.duplicate_line_id = duplicate.line_id
        return answer(f"You already have that {item.name} selection. Would you like another?")
    size_label = f"{variation.name} " if variation else ""
    return commit([*cart.lines, line], f"Added {pending.quantity} {size_label}{item.name}. Would you like to add anything to the order?")
