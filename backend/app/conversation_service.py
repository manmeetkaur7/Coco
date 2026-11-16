"""Local-model orchestration, validated action execution and honest fallback."""
import re
import os
from time import perf_counter
from .action_executor import execute_plan, preferences_for
from .cart_service import summarize
from .contextual_ordering import contextual_turn, flexible_size_fallback
from .conversation_intents import conversation_intent
from .conversation_intents import normalize_utterance as norm, is_order_completion
from .local_model import plan_turn, enabled, known_model_status, ModelUnavailable
from .model_schemas import UnsafeModelAction
from .ordering_engine import handle_turn
from .ordering_schemas import ModelState, SessionMessage, SessionMemory


def conversation_turn(request, restaurant, menu):
    # Check the incoming cart before any model request; don't send invalid state.
    summarize(request.cart, restaurant, menu)
    model = ModelState()
    response = None
    inference_ms = fallback_reason = None
    words = norm(request.text)
    protected = is_order_completion(words) or words in {"yes", "yes please", "no", "no thanks", "confirm demo", "confirm my order", "review order", "read back my order"}
    # Known, strictly validated cart operations and confirmation do not need
    # inference. This avoids making a customer wait for a model to echo a
    # decision the authoritative engine has already resolved safely.
    contextual = contextual_turn(request, restaurant, menu)
    verified = contextual or handle_turn(request, restaurant, menu)
    quick_social = words in {
        "hi", "hey", "hello", "coco", "koko", "cocoa", "hey coco", "hello coco", "hi coco",
        "give me a minute", "give me a moment", "wait", "hold on", "i m ready", "i am ready",
        "thank you", "thanks",
    }
    social_intent = conversation_intent(words, menu, request.conversation_active)
    fast = os.getenv("COCO_FAST_ORDERING", "true").casefold() not in {"false", "0", "off"} and (contextual is not None or protected or quick_social or (social_intent is not None and bool(re.search(r"\b(wait|minute|second|moment|hold)\b", words))) or (verified.context.pending is not None and verified.context.pending != request.context.pending) or verified.session_action == "end" or verified.context.duplicate_line_id is not None or verified.cart != request.cart)
    if fast:
        response = verified
        model = known_model_status()
        if model.available:
            model.message = "Answered directly by verified ordering without waiting for model inference. Local AI is available for flexible conversation."
    elif enabled():
        try:
            started = perf_counter()
            try:
                plan = plan_turn(request, restaurant, menu)
            finally:
                inference_ms = round((perf_counter() - started) * 1000, 1)
            # Protected completion/confirmation state belongs to the engine,
            # regardless of a model attempting a different action.
            if protected:
                response = handle_turn(request, restaurant, menu)
            elif re.search(r"[\u0900-\u097f\u0a00-\u0a7f]", request.text):
                response = handle_turn(request, restaurant, menu)
            else:
                response = execute_plan(plan, request, restaurant, menu)
            model = ModelState(available=True, mode="local", message="Local language model active. Menu and cart actions are validated.")
            response.engine = "local-model"
        except UnsafeModelAction:
            fallback_reason = "rejected"
            model = ModelState(available=True, mode="fallback", message="Local model connected, but this proposal needed the verified ordering fallback.")
        except ModelUnavailable as error:
            fallback_reason = error.reason
            model = ModelState(message="Local model unavailable or busy. Using the verified ordering fallback.")
    else:
        model = ModelState(mode="disabled", message="Local model disabled. Using the verified ordering fallback.")
    if response is None:
        response = flexible_size_fallback(request, restaurant, menu) or verified
    if response.reply.startswith("I'm not sure whether"):
        if request.context.pending:
            response.reply = "Which pizza or size would you like for the choice we started?"
        elif request.cart.lines:
            response.reply = "I didn’t catch the change. Which item would you like to update?"
        else:
            response.reply = "I didn’t catch the item. Which menu choice are you interested in?"
    # A duplicate offer only accepts an answer to that offer, never a later
    # unrelated "yes" after another question or the order readback.
    if request.context.duplicate_line_id and response.context.duplicate_line_id == request.context.duplicate_line_id and not response.reply.startswith("You already have"):
        response.context.duplicate_line_id = None
    response.model = model
    response.inference_ms = inference_ms
    response.fallback_reason = fallback_reason
    if response.session_action == "end":
        response.context.memory = SessionMemory()
    else:
        prefs = preferences_for(request.text, request.context.memory.preferences)
        notes = list(request.context.memory.notes)
        if re.search(r"\b(?:i (?:prefer|like|don t like|do not like)|my preference)\b", norm(request.text)):
            notes = [*notes, request.text[:120]][-5:]
        recent = [*request.context.memory.recent, SessionMessage(role="customer", text=request.text[:500]), SessionMessage(role="assistant", text=response.reply[:500])][-12:]
        response.context.memory = SessionMemory(recent=recent, preferences=prefs, notes=notes)
    return response
