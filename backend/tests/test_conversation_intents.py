import pytest
from app.catalog import CATALOG, RESTAURANT_CONFIG
from app.ordering_engine import handle_turn
from app.ordering_schemas import Cart, TurnRequest, OrderingContext


def turn(text, previous=None):
    return handle_turn(TurnRequest(text=text, cart=previous.cart if previous else Cart(), context=previous.context if previous else OrderingContext()), RESTAURANT_CONFIG, CATALOG)


@pytest.mark.parametrize("text, expected", [
    ("Coco", "Hi! Welcome"), ("Hey Coco.", "Hi! Welcome"),
    ("Hi", "Hi! Welcome"), ("Hello", "Hi! Welcome"),
    ("How are you?", "ready to help"), ("Thank you", "You're welcome"),
    ("Give me a minute", "Take your time"), ("Wait", "Take your time"),
    ("I'm ready", "Perfect!"), ("Okay, I'm ready.", "Perfect!"),
    ("What do you recommend?", "King Arthur"), ("What can you do?", "verified menu"),
    ("Cancel", "clear your draft or end"),
])
def test_friendly_intents_do_not_mutate_order_or_pending_context(text, expected):
    order = turn("I want a large pizza")
    response = turn(text, order)
    assert expected in response.reply
    assert response.cart == order.cart and response.context == order.context
    assert response.draft is None and response.session_action == "continue"


def test_requested_multi_turn_greeting_wait_ready_selection_completion_flow():
    result = turn("Hey Coco.")
    result = turn("Give me a minute", result)
    result = turn("Okay, I'm ready.", result)
    result = turn("I want a large pizza.", result)
    assert result.context.pending.variation_id == "large" and not result.cart.lines
    # A second greeting/wait must not be parsed as a pizza or erase the size.
    result = turn("Coco", result)
    result = turn("Wait", result)
    result = turn("I'm ready", result)
    result = turn("King Arthur's Supreme.", result)
    assert len(result.cart.lines) == 1
    assert result.cart.lines[0].item_id == "king-arthur"
    assert result.cart.lines[0].variation_id == "large"
    result = turn("That's everything.", result)
    assert result.draft is None and "Is this correct?" in result.reply
    result = turn("yes", result)
    assert result.draft.status == "demo_confirmed"
    assert not result.draft.submitted_to_restaurant


def test_goodbye_ends_session_but_keeps_cart_and_invalidates_confirmation():
    result = turn("large create your own pizza")
    reviewed = turn("review order", result)
    ended = turn("Goodbye", reviewed)
    assert ended.session_action == "end" and ended.cart == result.cart
    assert ended.context == OrderingContext() and ended.draft is None


@pytest.mark.parametrize("text", ["Coco add a unicorn pizza", "hello add pineapple", "what do you recommend for 2 dollars", "some unrelated sentence about the weather"])
def test_unknown_or_mixed_sentences_are_not_greetings(text):
    previous = turn("large create your own pizza")
    result = turn(text, previous)
    assert result.cart == previous.cart and result.draft is None
    assert "Hi! Welcome" not in result.reply


def test_recommendations_do_not_suggest_unavailable_items():
    menu = CATALOG.model_copy(deep=True)
    for item in menu.items:
        if item.category_id == "specialty": item.availability = "unavailable"
    result = handle_turn(TurnRequest(text="What do you recommend?", cart=Cart()), RESTAURANT_CONFIG, menu)
    assert "don't have a verified specialty selection" in result.reply
    assert not result.cart.lines


def test_cancel_cannot_leave_a_previous_confirmation_armed():
    previous = turn("review order", turn("large create your own pizza"))
    cancelled = turn("Cancel", previous)
    assert cancelled.cart == previous.cart and cancelled.context.review_token is None
    assert turn("yes", cancelled).draft is None


def test_repeating_thats_everything_reads_back_instead_of_rejecting_or_confirming():
    previous = turn("that's everything", turn("large create your own pizza"))
    repeated = turn("that's everything", previous)
    assert repeated.draft is None and repeated.context.review_token
    assert "Is this correct?" in repeated.reply
