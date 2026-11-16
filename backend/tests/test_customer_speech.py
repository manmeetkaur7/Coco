"""Regression coverage for the customer's real ASR transcript; no fuzzy cart edits."""
import pytest
from app.catalog import CATALOG, RESTAURANT_CONFIG
from app.ordering_engine import handle_turn
from app.ordering_schemas import Cart, OrderingContext, TurnRequest


def turn(text, previous=None, *, active=True, menu=CATALOG):
    return handle_turn(TurnRequest(text=text, conversation_active=active, cart=previous.cart if previous else Cart(), context=previous.context if previous else OrderingContext()), RESTAURANT_CONFIG, menu)


def test_exact_customer_transcript_keeps_one_large_pizza_and_reviews_without_submission():
    result = None
    for text in ["hey Google", "hello Google"]:
        result = turn(text, result)
        assert "Hi! Welcome" in result.reply and not result.cart.lines
    result = turn("I want a large pizza", result)
    assert result.context.pending.variation_id == "large"
    result = turn("Supreme", result)
    assert "Would you like King Arthur" in result.reply
    assert result.context.pending.choice_item_ids == ["king-arthur"]
    assert not result.cart.lines
    result = turn("King Arthur Supreme", result)
    assert len(result.cart.lines) == 1
    line = result.cart.lines[0]
    assert (line.item_id, line.variation_id, line.quantity) == ("king-arthur", "large", 1)
    assert "Added 1 Large King Arthur" in result.reply
    result = turn("that's everything I want", result)
    assert "Is this correct?" in result.reply and "Large King Arthur" in result.reply
    assert result.draft is None and result.context.review_token
    assert result.summary.subtotal is None and result.summary.total is None
    confirmed = turn("yes", result)
    assert confirmed.cart == result.cart
    assert confirmed.draft.status == "demo_confirmed"
    assert not confirmed.draft.submitted_to_restaurant and not confirmed.draft.payment_processed


@pytest.mark.parametrize("text", ["Coco", "Koko", "Cocoa", "Hey Koko!", "Hello, Cocoa.", "Hi Coco"])
def test_name_variants_preserve_pending_size(text):
    pending = turn("I want two large pizzas")
    result = turn(text, pending)
    assert "Hi! Welcome" in result.reply
    assert result.cart == pending.cart and result.context == pending.context


@pytest.mark.parametrize("text", ["Hey Google!", "hello, Google."])
def test_google_greeting_is_active_context_only(text):
    assert "Hi! Welcome" in turn(text, active=True).reply
    result = turn(text, active=False)
    assert "Hi! Welcome" not in result.reply and not result.cart.lines


@pytest.mark.parametrize("text", ["Google", "Google Pay", "Can I use Google Pay?", "Tell me about Google", "Hey Google can I use Google Pay", "hello Google add a unicorn pizza", "Cocoa add a unicorn pizza"])
def test_google_and_mixed_requests_never_become_greetings_or_mutate_cart(text):
    original = turn("large create your own pizza")
    result = turn(text, original)
    assert "Hi! Welcome" not in result.reply
    assert result.cart == original.cart and result.draft is None


@pytest.mark.parametrize("text", ["That's everything", "That's everything I want", "That's all", "That's it", "I'm done", "Nothing else", "No, that's all", "That's my order", "Okay, that's everything I want, thank you!", "Thats everything I want", "That is all, please"])
def test_completion_variants_review_only_and_cannot_skip_a_pending_item(text):
    ordered = turn("large king arthur supreme")
    review = turn(text, ordered)
    assert "Is this correct?" in review.reply
    assert review.cart == ordered.cart and review.draft is None
    pending = turn("I want a large pizza", ordered)
    blocked = turn(text, pending)
    assert blocked.context.pending and not blocked.context.review_token
    assert blocked.cart == ordered.cart and blocked.draft is None


def test_short_selection_yes_chooses_item_not_order_confirmation():
    pending = turn("Supreme", turn("I want a large pizza"))
    for text in ["Give me a minute", "Hey Google", "Koko", "Okay, I'm ready"]:
        result = turn(text, pending)
        assert result.context == pending.context and result.cart == pending.cart
        pending = result
    chosen = turn("yes", pending)
    assert len(chosen.cart.lines) == 1 and chosen.cart.lines[0].variation_id == "large"
    assert chosen.draft is None and chosen.context.review_token is None


def test_rejecting_single_suggestion_retains_size_and_does_not_review():
    pending = turn("Supreme", turn("I want a large pizza"))
    result = turn("no", pending)
    assert not result.cart.lines and result.context.pending.variation_id == "large"
    assert not result.context.pending.choice_item_ids and result.draft is None


def test_multiple_supreme_matches_require_full_choice_without_guessing():
    menu = CATALOG.model_copy(deep=True)
    # Test-only extra menu entry; no invented item is imported into real data.
    item = menu.items[0].model_copy(deep=True)
    item.id = "another-supreme-fixture"
    item.name = "Another Supreme Pizza"
    item.aliases = ["another supreme"]
    menu.items.append(item)
    pending = turn("Supreme", turn("I want a large pizza", menu=menu), menu=menu)
    assert not pending.cart.lines
    assert set(pending.context.pending.choice_item_ids) == {"king-arthur", "another-supreme-fixture"}
    assert "King Arthur" in pending.reply and "Another Supreme" in pending.reply
    assert not turn("yes", pending, menu=menu).cart.lines
    selected = turn("King Arthur Supreme", pending, menu=menu)
    assert len(selected.cart.lines) == 1 and selected.cart.lines[0].item_id == "king-arthur"
    assert selected.cart.lines[0].variation_id == "large"


@pytest.mark.parametrize("text", ["Supreme pineapple", "Supreme with unicorn", "Supreem", "Google Pay Supreme"])
def test_partial_unknown_or_misspelled_options_are_not_fuzzily_selected(text):
    pending = turn("I want a large pizza")
    result = turn(text, pending)
    assert result.cart == pending.cart and result.context == pending.context


@pytest.mark.parametrize("text", ["King Arthur Supreme", "King Arthur's Supreme", "King Arthur’s Supreme!", "King Arthurs Supreme"])
def test_full_name_variants_preserve_and_speak_large_size(text):
    result = turn(text, turn("I want a large pizza"))
    assert len(result.cart.lines) == 1 and result.cart.lines[0].variation_id == "large"
    assert "Added 1 Large King Arthur" in result.reply


def test_unavailable_large_requires_another_size_and_never_defaults():
    menu = CATALOG.model_copy(deep=True)
    large = next(option for option in menu.items[0].variations if option.id == "large")
    large.availability = "unavailable"
    result = turn("King Arthur Supreme", turn("I want a large pizza", menu=menu), menu=menu)
    assert not result.cart.lines
    assert result.context.pending.variation_id == "large"
    assert "requested Large" in result.reply and "marked unavailable" in result.reply
    assert "Choose Personal, Small, Medium, X-Large" in result.reply
    selected = turn("medium", result, menu=menu)
    assert len(selected.cart.lines) == 1 and selected.cart.lines[0].variation_id == "medium"


def test_unsupported_large_requires_another_size_and_completion_is_not_a_prefix_match():
    menu = CATALOG.model_copy(deep=True)
    menu.items[0].variations = [option for option in menu.items[0].variations if option.id != "large"]
    pending = turn("King Arthur Supreme", turn("I want a large pizza", menu=menu), menu=menu)
    assert not pending.cart.lines and pending.context.pending.variation_id == "large"
    ordered = turn("large king arthur supreme")
    result = turn("that's everything I want with unicorn", ordered)
    assert result.cart == ordered.cart and not result.context.review_token and result.draft is None
