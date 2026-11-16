"""Local-model orchestration, validated action execution and honest fallback."""
import re
import os
from .action_executor import execute_plan, preferences_for
from .cart_service import summarize
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
    words = norm(request.text)
    protected = is_order_completion(words) or words in {"yes", "yes please", "no", "no thanks", "confirm demo", "confirm my order", "review order", "read back my order"}
    # Known, strictly validated cart operations and confirmation do not need
    # inference. This avoids making a customer wait for a model to echo a
    # decision the authoritative engine has already resolved safely.
    verified = handle_turn(request, restaurant, menu)
    quick_social = words in {
        "hi", "hey", "hello", "coco", "koko", "cocoa", "hey coco", "hello coco", "hi coco",
        "give me a minute", "give me a moment", "wait", "hold on", "i m ready", "i am ready",
        "thank you", "thanks",
    }
    fast = os.getenv("COCO_FAST_ORDERING", "true").casefold() not in {"false", "0", "off"} and (protected or quick_social or verified.session_action == "end" or verified.cart != request.cart)
    if fast:
        response = verified
        model = known_model_status()
        if model.available:
            model.message = "Answered directly by verified ordering without waiting for model inference. Local AI is available for flexible conversation."
    elif enabled():
        try:
            plan = plan_turn(request, restaurant, menu)
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
            model = ModelState(available=True, mode="fallback", message="Local model connected, but this proposal needed the verified ordering fallback.")
        except ModelUnavailable:
            model = ModelState(message="Local model unavailable or busy. Using the verified ordering fallback.")
    else:
        model = ModelState(mode="disabled", message="Local model disabled. Using the verified ordering fallback.")
    if response is None:
        response = handle_turn(request, restaurant, menu)
    response.model = model
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
