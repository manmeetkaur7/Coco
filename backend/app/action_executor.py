"""Execute model proposals only through the verified deterministic engine.

The model cannot return cart lines, totals, review tokens or payment decisions.
Factual speech is assembled from the validated result, never from model prose.
"""
import re
from .conversation_intents import menu_phrases, normalize_utterance as norm
from .model_schemas import ConversationPlan, UnsafeModelAction
from .ordering_engine import handle_turn
from .ordering_schemas import PendingItem, TurnRequest, TurnResponse
from .cart_service import summarize
from .contextual_ordering import REF, reference


SOCIAL_WORDS = set("""a about absolutely again all alright am an and any anything are as at be begin can certainly choose choosing clear could course do done don else feel fine for glad go good happy hello help here hi how i if in is it let like m me minute moment more my need no not now of okay on one or order ordering our patient perfect please ready s say shall so some start sure t take tell thank thanks that the then there think this time to together understand us wait waiting want welcome what when whenever which with would you your re ve will we ll have rather change changed mind instead sorry prefer preference question another just little need""".split())
SOCIAL_WORDS.update({"coco", "today", "may", "rush", "mood", "whenever", "certain", "understood", "absolutely"})
SOCIAL_WORDS.update({"know", "problem", "decide", "deciding", "hurry", "need", "second", "sec", "back", "once", "thinking", "welcome", "both", "options", "size", "quantity", "choice", "selection"})
SOCIAL_WORDS.update({"come", "after", "while", "pause", "whenever", "certainly", "absolutely", "understanding", "appreciate", "patience", "continue", "helping", "decided", "helpful", "before", "get", "started", "wait", "until", "resume", "item", "items", "assist", "whichever", "appreciate"})


def social_speech(text: str) -> str | None:
    # A deliberately non-factual surface: generated social prose cannot assert
    # menu/ingredient/price/stock/discount facts, even after prompt injection.
    if not text.strip() or len(text) > 220 or text.count("?") > 1 or text.count("!") > 1 or len(re.findall(r"[.!?](?:\s|$)", text)) > 2 or re.search(r"[^\x00-\x7f]", text):
        return None
    words = set(norm(text).split())
    if not words <= SOCIAL_WORDS:
        return None
    if re.search(r"\b(added|removed|changed|confirmed|placed|paid|submitted|discount|free|available|contains|includes)\b|\border (?:is|was) (?:done|ready)\b", norm(text)):
        return None
    return text.strip()


def mentioned(text, option):
    return any(re.search(r"\b" + re.escape(phrase) + r"\b", norm(text)) for phrase in menu_phrases(option))


def preferences_for(text, previous):
    result = list(previous)
    words = norm(text)
    if re.search(r"\b(not vegetarian|eat meat|no longer vegetarian)\b", words):
        result = [value for value in result if value != "vegetarian"]
    elif re.search(r"\b(vegetarian|veggie|no meat|without meat)\b", words):
        if "vegetarian" not in result: result.append("vegetarian")
    for noun, key in [("mushrooms?", "no_mushrooms"), ("onions?", "no_onions")]:
        if re.search(r"\b(?:no|without|avoid|don t like|do not like|don t want|do not want) (?:any )?" + noun + r"\b", words) and key not in result:
            result.append(key)
        if re.search(r"\b(?:actually|now) (?:i )?(?:like|want) " + noun + r"\b", words):
            result = [value for value in result if value != key]
    return result


def raw_safety(text, menu):
    words = norm(text)
    if "$" in text or re.search(r"\b(extra cheese|half|halves|sauce|crust|gluten free|giant|jumbo|unicorn|dollars?|budget)\b", words):
        raise UnsafeModelAction("Unverified customization or price constraint")
    if re.search(r"\b\d+\s*(?:inch|inches)\b", words): raise UnsafeModelAction("Unverified numeric size")
    if re.search(r"\bonions?\b", words) and not re.search(r"\b(red|yellow) onions?\b", words): raise UnsafeModelAction("Onion type is ambiguous")
    if re.search(r"\b(and|then)\b", words):
        raise UnsafeModelAction("Compound changes need clarification")
    # Never discard unverified modifiers after with/without, nor a second
    # unknown topping in a direct add/remove phrase.
    marker = re.search(r"\b(with|without) (.+)$", words)
    direct = re.match(r"(?:add|remove|take off) (.+)$", words)
    tail = marker[2] if marker else direct[1] if direct else ""
    if tail:
        tail = re.sub(rf"\bfor (?:the )?{REF} (?:pizza|item|one)(?: instead)?(?: please)?$", "", tail)
        for option in [*menu.items, *menu.toppings, *[option for item in menu.items for option in item.variations]]:
            for alias in sorted(menu_phrases(option), key=len, reverse=True):
                tail = re.sub(r"\b" + re.escape(alias) + r"\b", " ", tail)
        tail = re.sub(r"\b(a|an|the|some|please|instead|one|two|three|four|five|six|seven|eight|nine|ten|pizza|pizzas|\d+)\b|\s", "", tail)
        if tail: raise UnsafeModelAction("Unknown item or customization would be ignored")


def target_for(plan, request, menu):
    selected = request.context.target_line_id
    refs = re.findall(rf"\b{REF} (pizza|item|one)\b", norm(request.text))
    named = [line for line in request.cart.lines if any(item.id == line.item_id and mentioned(request.text, item) for item in menu.items)]
    if refs:
        if len(refs) != 1: raise UnsafeModelAction("More than one line reference")
        line = reference(request, *refs[0], menu)
        if line and named and line not in named: raise UnsafeModelAction("Conflicting item references")
    elif named:
        line = named[0] if len(named) == 1 else None
    else:
        target = selected or (request.cart.lines[0].line_id if len(request.cart.lines) == 1 else None)
        line = next((entry for entry in request.cart.lines if entry.line_id == target), None)
    if not line or (plan.target_line_id and plan.target_line_id != line.line_id):
        raise UnsafeModelAction("A unique, customer-grounded cart target is required")
    if request.context.pending and plan.intent != "ingredients":
        raise UnsafeModelAction("Finish or replace the pending selection before editing a cart line")
    return line


def execute_plan(plan: ConversationPlan, request, restaurant, menu) -> TurnResponse:
    allowed = {
        "chat": set(), "clarify": set(), "recommend": {"recommendations"}, "ingredients": {"item_id", "target_line_id"},
        "add": {"item_id", "quantity", "variation_id"}, "size": {"variation_id", "target_line_id"},
        "quantity": {"quantity", "target_line_id"}, "add_topping": {"topping_id", "target_line_id"},
        "remove_topping": {"topping_id", "target_line_id"}, "remove_item": {"target_line_id"},
        "clear": set(), "review": set(), "confirm": set(), "total": set(), "end": set(),
    }
    for field in ["item_id", "quantity", "variation_id", "target_line_id", "topping_id", "recommendations"]:
        value = getattr(plan, field)
        if value is not None and value != [] and field not in allowed[plan.intent]:
            raise UnsafeModelAction("Unexpected action fields cannot be silently ignored")
    result = TurnResponse(reply="", cart=request.cart.model_copy(deep=True), context=request.context.model_copy(deep=True), summary=summarize(request.cart, restaurant, menu))
    if plan.intent in {"chat", "clarify"}:
        speech = social_speech(plan.speech)
        if not speech: raise UnsafeModelAction("Generated prose was not safe non-factual conversation")
        result.reply = speech
        return result
    if plan.intent == "recommend":
        prefs = preferences_for(request.text, request.context.memory.preferences)
        choices = [item for item in menu.items if item.id in plan.recommendations and item.kind == "pizza" and item.availability != "unavailable"]
        if any(key not in {item.id for item in menu.items} for key in plan.recommendations):
            raise UnsafeModelAction("Recommendation is not in verified catalog")
        for pref in prefs:
            excluded = {"vegetarian": r"pepperoni|sausage|salami|lingui|chicken|ham|bacon", "no_mushrooms": r"mushroom", "no_onions": r"onion"}[pref]
            choices = [item for item in choices if item.ingredients and not re.search(excluded, " ".join(item.ingredients), re.I)]
        if choices:
            names = [item.name for item in choices[:2]]
            result.reply = "You could try " + " or ".join(names) + ". Would either of those interest you?"
            if not result.context.pending or not result.context.pending.item_id:
                result.context.pending = result.context.pending or PendingItem()
                result.context.pending.choice_item_ids = [item.id for item in choices[:2]]
                result.context.review_token = None
        else:
            result.reply = "Would you like to choose from the listed toppings for a create-your-own pizza? The base recipe still needs location confirmation."
        return result
    if plan.intent == "total":
        result.reply = f"The verified total is {result.summary.total:.2f} USD." if result.summary.total is not None else "Prices and tax haven't been verified for this location, so I can't quote a total."
        return result
    copy = request.model_copy(deep=True)
    command = ""
    if plan.intent in {"review", "confirm", "end", "clear"}:
        command = {"review": "review order", "confirm": "yes", "end": "goodbye", "clear": "clear cart"}[plan.intent]
        if plan.intent == "confirm" and not re.fullmatch(r"(?:yes(?: please| that s correct| that is correct)?|confirm (?:demo|my order)|that s (?:right|correct)|correct)", norm(request.text)):
            raise UnsafeModelAction("Confirmation must be an explicit customer affirmation")
        if plan.intent == "review" and not re.search(r"\b(done|everything|all|finish|confirm|review|read back|that s it|will do|that is it|we re good)\b", norm(request.text)):
            raise UnsafeModelAction("An order review needs a customer completion request")
        if plan.intent == "end" and not re.search(r"\b(bye|goodbye|end|stop talking)\b", norm(request.text)):
            raise UnsafeModelAction("No explicit conversation-ending intent")
        if plan.intent == "clear" and not re.search(r"\b(clear|empty|start over|start fresh|cancel (?:my |the )?order)\b", norm(request.text)):
            raise UnsafeModelAction("Clearing a cart requires an explicit request")
    elif plan.intent == "ingredients":
        item = next((item for item in menu.items if item.id == plan.item_id), None)
        if item is None:
            line = target_for(plan, request, menu)
            item = next(item for item in menu.items if item.id == line.item_id)
        elif not mentioned(request.text, item) and not any(line.item_id == item.id for line in request.cart.lines):
            raise UnsafeModelAction("Ingredient target is not grounded")
        command = f"what is in {item.name}"
    else:
        raw_safety(request.text, menu)
        words = norm(request.text)
        if re.match(r"(?:do you (?:have|offer|sell|carry)|is there|are there|is .+ available|how (?:much|many)|what|which|can you tell me)\b", words):
            raise UnsafeModelAction("A menu question is not permission to alter the cart")
        if plan.intent == "add":
            if re.search(r"\b(remove|delete|drop|skip|forget|cancel|not|don t)\b", norm(request.text)):
                raise UnsafeModelAction("A negative/removal request cannot add an item")
            if re.search(r"\b(with|without|no|extra)\b", norm(request.text)):
                raise UnsafeModelAction("A base-item proposal cannot omit customization requests")
            item = next((item for item in menu.items if item.id == plan.item_id), None)
            if item is None: raise UnsafeModelAction("Unknown menu item")
            pending = request.context.pending
            from .ordering_engine import matches
            if any(entry.id != item.id for entry in matches(norm(request.text), menu.items)):
                raise UnsafeModelAction("The request names a different or additional menu item")
            modifier_text = words
            for alias in sorted(menu_phrases(item), key=len, reverse=True):
                modifier_text = re.sub(r"\b" + re.escape(alias) + r"\b", " ", modifier_text)
            if matches(modifier_text, menu.toppings):
                raise UnsafeModelAction("The model add would omit an explicit topping")
            if not pending and re.search(r"\b(instead|rather|replace)\b", norm(request.text)):
                raise UnsafeModelAction("A replacement must not become an addition")
            if pending and pending.item_id and pending.item_id != item.id:
                if not re.search(r"\b(actually|rather|instead)\b", norm(request.text)):
                    raise UnsafeModelAction("Changing the pending item needs an explicit correction")
                copy.context.pending.item_id = None
                copy.context.pending.choice_item_ids = []
            explicit = mentioned(request.text, item)
            unique = pending and (pending.item_id == item.id or pending.choice_item_ids == [item.id])
            if not explicit:
                if not unique: raise UnsafeModelAction("Item choice was inferred without a unique pending selection")
                # Existing clarification logic owns the original yes/that-one turn.
                if norm(request.text) in {"yes", "yes please", "that one", "yes that one"}:
                    copy.text = request.text
                    return handle_turn(copy, restaurant, menu)
                # Size-only continuation is allowed for the selected pending item.
                if not pending.item_id: raise UnsafeModelAction("Unconfirmed partial item choice")
            quantity = plan.quantity or (pending.quantity if pending else 1)
            explicit_quantity = quantity_in(request.text, item, menu)
            if explicit_quantity is not None:
                if plan.quantity is not None and plan.quantity != explicit_quantity: raise UnsafeModelAction("Explicit quantity was omitted or contradicted")
                quantity = explicit_quantity
            if not 1 <= quantity <= 20: raise UnsafeModelAction("Quantity outside supported bounds")
            if quantity != (pending.quantity if pending else 1) and not quantity_mentioned(request.text, item, quantity):
                raise UnsafeModelAction("Quantity was not requested")
            requested_sizes = matches(norm(request.text), item.variations)
            if len(requested_sizes) > 1:
                raise UnsafeModelAction("More than one size was named")
            if requested_sizes and plan.variation_id and plan.variation_id != requested_sizes[0].id:
                raise UnsafeModelAction("Proposed size contradicts the request")
            variation_id = (requested_sizes[0].id if requested_sizes else plan.variation_id) or (pending.variation_id if pending else None)
            variation = next((option for option in item.variations if option.id == variation_id), None)
            if plan.variation_id and (not variation or (not mentioned(request.text, variation) and not (pending and pending.variation_id == plan.variation_id))):
                raise UnsafeModelAction("Size was not requested or is unsupported")
            if variation and variation.availability == "unavailable": raise UnsafeModelAction("Size unavailable")
            another = "another " if re.search(r"\b(another|additional)\b", norm(request.text)) else ""
            command = f"{another}{quantity} {variation.name + ' ' if variation else ''}{item.name}"
        else:
            line = target_for(plan, request, menu)
            copy.context.target_line_id = line.line_id
            item = next(item for item in menu.items if item.id == line.item_id)
            if plan.intent == "size":
                if re.search(r"\b(add|remove|delete|cancel|not|don t)\b", norm(request.text)):
                    raise UnsafeModelAction("A different or negative action cannot become a size change")
                option = next((option for option in item.variations if option.id == plan.variation_id), None)
                if option is None or not mentioned(request.text, option): raise UnsafeModelAction("Unverified/inferred size change")
                from .ordering_engine import matches
                if [entry.id for entry in matches(words, item.variations)] != [option.id]:
                    raise UnsafeModelAction("Conflicting sizes need clarification")
                requested = quantity_in(request.text, item, menu)
                if requested is not None and requested != line.quantity: raise UnsafeModelAction("Size-only action omitted a quantity change")
                if any(mentioned(request.text, topping) for topping in menu.toppings): raise UnsafeModelAction("Size-only action omitted a topping change")
                command = f"make it {option.name}"
            elif plan.intent == "quantity":
                if re.search(r"\b(add|remove|delete|cancel|not|don t)\b", norm(request.text)):
                    raise UnsafeModelAction("A different or negative action cannot become a quantity change")
                if plan.quantity is None or quantity_in(request.text, item, menu) != plan.quantity: raise UnsafeModelAction("Unrequested or ambiguous quantity")
                if any(mentioned(request.text, option) and option.id != line.variation_id for option in item.variations): raise UnsafeModelAction("Quantity-only action omitted a size change")
                command = f"make it {plan.quantity}"
            elif plan.intent in {"add_topping", "remove_topping"}:
                words = norm(request.text)
                negative = bool(re.search(r"\b(remove|without|no|hold|skip|leave .+ off|don t want|do not want)\b", words))
                positive = bool(re.search(r"\b(add|with|include|put|more)\b", words))
                if (plan.intent == "add_topping" and (negative or not positive)) or (plan.intent == "remove_topping" and not negative):
                    raise UnsafeModelAction("The topping operation is not grounded in the request")
                option = next((option for option in menu.toppings if option.id == plan.topping_id), None)
                if option is None or not mentioned(request.text, option): raise UnsafeModelAction("Unrequested/unverified topping")
                from .ordering_engine import matches
                if [entry.id for entry in matches(norm(request.text), menu.toppings)] != [option.id] or quantity_in(request.text, item, menu) is not None:
                    raise UnsafeModelAction("A single topping action cannot omit another option or portion")
                command = ("add " if plan.intent == "add_topping" else "remove ") + option.name
            elif plan.intent == "remove_item":
                if not re.search(r"\b(remove|delete|drop|skip|forget)\b", norm(request.text)): raise UnsafeModelAction("No explicit removal request")
                if any(mentioned(request.text, option) for option in menu.toppings) and not mentioned(request.text, item):
                    raise UnsafeModelAction("A topping removal must not remove the whole item")
                if "forget" in norm(request.text) and not mentioned(request.text, item) and not re.search(r"\b(?:last|that|this) item\b", norm(request.text)):
                    raise UnsafeModelAction("Ambiguous forget request")
                quantity = quantity_in(request.text, item, menu)
                if quantity is not None and quantity != line.quantity: raise UnsafeModelAction("Whole-line removal cannot silently remove a different quantity")
                # The engine supports remove-last. Reorder only the local copy,
                # then restore remaining line order in the validated result.
                copy.cart.lines = [entry for entry in copy.cart.lines if entry.line_id != line.line_id] + [line]
                command = "remove the last item"
    copy.text = command
    response = handle_turn(copy, restaurant, menu)
    if plan.intent == "remove_item":
        ids = {line.line_id for line in response.cart.lines}
        response.cart.lines = [line for line in request.cart.lines if line.line_id in ids]
        response.summary = summarize(response.cart, restaurant, menu)
    if response.cart != request.cart:
        if plan.intent == "add":
            added = response.summary.lines[-1]
            response.reply = f"I've added {added.line.quantity} {added.variation_name + ' ' if added.variation_name else ''}{added.name}."
        elif plan.intent == "size":
            response.reply = f"Of course. I've changed that to a {option.name.lower()}."
        elif plan.intent == "quantity": response.reply = f"I've changed the quantity to {plan.quantity}."
        elif plan.intent in {"add_topping", "remove_topping"}: response.reply = f"I've {'added' if plan.intent == 'add_topping' else 'removed'} {option.name.lower()}."
        elif plan.intent == "remove_item": response.reply = "I've removed that item."
        elif plan.intent == "clear": response.reply = "Your draft is cleared. What would you like to start with?"
    return response


def quantity_mentioned(text, item, quantity):
    words = norm(text)
    for alias in sorted(menu_phrases(item), key=len, reverse=True): words = re.sub(r"\b" + re.escape(alias) + r"\b", " ", words)
    numbers = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"]
    return bool(re.search(r"\b(?:" + str(quantity) + "|" + numbers[quantity] + r")\b", words))


def quantity_in(text, item, menu):
    words = norm(text)
    words = re.sub(rf"\b(?:that|this|{REF}) one\b", "that", words)
    for option in [item, *[entry for product in menu.items for entry in product.variations]]:
        for alias in sorted(menu_phrases(option), key=len, reverse=True): words = re.sub(r"\b" + re.escape(alias) + r"\b", " ", words)
    numbers = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"]
    found = re.findall(r"\b(?:\d+|" + "|".join(numbers) + r")\b", words)
    if len(found) > 1: raise UnsafeModelAction("Multiple quantities need clarification")
    if not found: return None
    return int(found[0]) if found[0].isdigit() else numbers.index(found[0])
