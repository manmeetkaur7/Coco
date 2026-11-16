"""Bounded, reversible ordering operations for explicit references and batches."""
import re
from uuid import uuid4

from .conversation_intents import normalize_utterance as norm
from .ordering_engine import handle_turn, matches
from .ordering_schemas import PendingEdit, TurnResponse
from .cart_service import summarize

ORDINALS = {"first": 0, "second": 1, "third": 2, "fourth": 3, "fifth": 4, "last": -1}
REF = r"(first|second|third|fourth|fifth|last)"
SIZE = r"(personal|small|medium|large|extra large|x large)"
EDIT = re.compile(rf"(?:actually )?(?:make|change) (?:the )?{REF} (pizza|item|one)(?: to)? (?:a )?{SIZE}(?: please)?")
UNSCOPED = re.compile(rf"(?:actually )?(?:make|change) (?:that|it|that one)(?: to)? (?:a )?{SIZE}(?: please)?")


def reference(request, ordinal, kind, menu):
    pizza_ids = {item.id for item in menu.items if item.kind == "pizza"}
    lines = [line for line in request.cart.lines if kind != "pizza" or line.item_id in pizza_ids]
    index = ORDINALS[ordinal]
    return lines[index] if lines and index < len(lines) else None


def edit_size(request, restaurant, menu, line, size):
    candidate = request.model_copy(deep=True)
    candidate.context.pending = None
    candidate.context.pending_edit = None
    candidate.context.target_line_id = line.line_id
    candidate.text = "make it " + size
    result = handle_turn(candidate, restaurant, menu)
    if result.cart == request.cart:
        item = next(item for item in menu.items if item.id == line.item_id)
        if any(option.id == line.variation_id for option in matches(size, item.variations)):
            result.reply = f"That {item.name} is already {size}."
        else:
            # A rejected size must not discard pending choices or change focus.
            result.context = request.context.model_copy(deep=True)
            result.context.review_token = None
    return result


def contextual_turn(request, restaurant, menu):
    """Return None for language that still needs the model or legacy engine."""
    words = norm(request.text)
    context = request.context
    def clarify(reply):
        state = context.model_copy(deep=True)
        state.review_token = None
        return TurnResponse(reply=reply, cart=request.cart, context=state, summary=summarize(request.cart, restaurant, menu))

    if context.duplicate_line_id and not context.pending and not context.pending_edit:
        duplicate = next((line for line in request.cart.lines if line.line_id == context.duplicate_line_id), None)
        if duplicate and re.fullmatch(r"(?:yes(?: please)?|(?:add )?another(?: one)?(?: please)?)", words):
            candidate = request.cart.model_copy(deep=True)
            candidate.lines.append(duplicate.model_copy(update={"line_id": str(uuid4())}))
            try:
                candidate = type(candidate).model_validate(candidate.model_dump())
                summary = summarize(candidate, restaurant, menu)
            except ValueError:
                result = clarify("I couldn’t add another of that selection. Your cart is unchanged.")
                result.context.duplicate_line_id = None
                return result
            result = clarify("I’ve added another of that selection.")
            result.cart, result.summary = candidate, summary
            result.context.target_line_id = candidate.lines[-1].line_id
            result.context.duplicate_line_id = None
            return result
        if re.fullmatch(r"(?:no(?: thanks| thank you)?|keep it as is|never mind)", words):
            result = clarify("Of course. I’ve kept your cart as it was.")
            result.context.duplicate_line_id = None
            return result

    edit = EDIT.fullmatch(words)
    if edit and not context.pending:
        line = reference(request, edit[1], edit[2], menu)
        return edit_size(request, restaurant, menu, line, edit[3]) if line else clarify("I couldn't find that item. Which cart item would you like to change?")
    choice = re.fullmatch(rf"(?:the )?{REF}(?: (pizza|item|one))?(?: please)?", words)
    if context.pending_edit and not context.pending:
        if choice:
            line = reference(request, choice[1], choice[2], menu)
            return edit_size(request, restaurant, menu, line, context.pending_edit.size) if line else clarify("I couldn't find that item. Which cart item did you mean?")
        if re.fullmatch(r"(?:never mind|forget that|cancel that)(?: please)?", words):
            result = clarify("Of course. I’ve kept your cart as it was.")
            result.context.pending_edit = None
            return result
    if choice and choice[2] and request.cart.lines and not context.pending:
        line = reference(request, choice[1], choice[2], menu)
        if not line:
            return clarify("I couldn't find that item. Which cart item did you mean?")
        item = next(item for item in menu.items if item.id == line.item_id)
        result = clarify(f"What would you like to change about the {item.name}?")
        result.context.target_line_id = line.line_id
        return result
    size = UNSCOPED.fullmatch(words)
    if size and context.pending:
        candidate = request.model_copy(deep=True)
        candidate.text = size[1]
        return handle_turn(candidate, restaurant, menu)
    if size and not context.pending and len(request.cart.lines) > 1 and not context.target_line_id:
        result = clarify("Which cart item would you like to change?")
        result.context.pending_edit = PendingEdit(size=size[1])
        return result

    # Treat an explicit change of mind as replacing the *pending* selection,
    # never an already-added cart line and never silently dropping modifiers.
    replacement = re.fullmatch(r"(?:actually|instead) (.+?)(?: instead)?", words)
    if replacement and context.pending and matches(replacement[1], menu.items):
        candidate = request.model_copy(deep=True)
        candidate.context.pending.item_id = None
        candidate.context.pending.choice_item_ids = []
        candidate.text = replacement[1]
        result = handle_turn(candidate, restaurant, menu)
        if result.cart != request.cart or result.context.pending and result.context.pending.item_id:
            return result
        return clarify("I couldn’t verify that replacement. Which listed item would you like instead?")

    # Independent named items are an atomic batch. Never split a topping list
    # or combined edit into a partially applied order.
    if re.search(r"\b(and|then)\b", words) and not context.pending and matches(words, menu.items) and not re.search(r"\b(remove|change|make|without|no|instead|cancel|not|don t)\b", words):
        parts = re.split(r"\b(?:and then|and|then)\b", words)
        if not 2 <= len(parts) <= 3 or not all(len(matches(part, menu.items)) == 1 for part in parts):
            return clarify("I couldn’t separate those choices safely. Which item would you like to start with?")
        candidate = request.model_copy(deep=True)
        for part in parts:
            candidate.text = part.strip()
            result = handle_turn(candidate, restaurant, menu)
            if len(result.cart.lines) != len(candidate.cart.lines) + 1:
                item = matches(part, menu.items)[0]
                return clarify(f"I haven’t changed the cart. Could you repeat your choices with the size and options for {item.name}?")
            candidate.cart, candidate.context = result.cart, result.context
        added = result.summary.lines[-len(parts):]
        descriptions = [f"{entry.line.quantity} {entry.variation_name + ' ' if entry.variation_name else ''}{entry.name}" for entry in added]
        result.reply = "I’ve added " + "; ".join(descriptions) + ". Would you like anything else?"
        return result
    return None

def flexible_size_fallback(request, restaurant, menu):
    """Last resort for a fully verified size; never turn an edit into an add."""
    if request.context.pending or request.context.pending_edit:
        return None
    words = norm(request.text)
    request_size = re.fullmatch(rf"(?:could|can) (?:we|i) go with (?:the |a )?{SIZE} instead(?: please)?", words)
    if not request_size:
        return None
    target = request.context.target_line_id
    line = next((line for line in request.cart.lines if line.line_id == target), None)
    if not line and len(request.cart.lines) == 1:
        line = request.cart.lines[0]
    if line:
        return edit_size(request, restaurant, menu, line, request_size[1])
    if request.cart.lines:
        context = request.context.model_copy(deep=True)
        context.review_token = None
        context.pending_edit = PendingEdit(size=request_size[1])
        return TurnResponse(reply="Which cart item would you like to make " + request_size[1] + "?",
                            cart=request.cart, context=context, summary=summarize(request.cart, restaurant, menu))
    return None
