from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.main import app
from app.catalog import CATALOG, RESTAURANT_CONFIG
from app.cart_service import summarize, create_draft
from app.ordering_engine import handle_turn
from app.ordering_schemas import Cart, CartLine, DraftRequest, TurnRequest, OrderingContext, Option

client = TestClient(app)
ROOT = "/api/v1/restaurants/round-table"

def line(**changes):
    return CartLine.model_validate({"line_id":"line-1","item_id":"create-your-own","variation_id":"large",**changes})

def cart(**changes):
    return Cart(lines=[line(**changes)])

def turn(text, previous=None):
    return handle_turn(TurnRequest(text=text, cart=previous.cart if previous else Cart(), context=previous.context if previous else OrderingContext()), RESTAURANT_CONFIG, CATALOG)

def priced_fixture():
    # Synthetic test prices only. These values are never imported into the real catalog.
    menu = CATALOG.model_copy(deep=True)
    restaurant = RESTAURANT_CONFIG.model_copy(deep=True)
    restaurant.tax.rate = Decimal("0.08")
    restaurant.tax.source_url = "https://example.test/test-tax"
    for item in menu.items:
        for variant in item.variations:
            variant.price = Decimal("10.00"); variant.price_source_url = "https://example.test/test-prices"
    menu.toppings[1].price = Decimal("1.25")
    menu.toppings[1].price_source_url = "https://example.test/test-prices"
    return restaurant, menu

def test_catalog_loading_and_provenance():
    response = client.get(ROOT + "/menu")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 12
    assert all(item["price"] is None and item["source_url"].startswith("https://www.roundtablepizza.com/") for item in data["items"])
    assert len(client.get(ROOT + "/menu/categories").json()) == 8
    assert client.get(ROOT).json()["tax"]["rate"] is None
    assert client.get("/api/v1/restaurants/unknown/menu").status_code == 404

def test_search_and_missing_items():
    results = client.get(ROOT + "/menu/items", params={"q":"mushrooms","category":"specialty"}).json()
    assert {entry["id"] for entry in results} == {"king-arthur","guinevere"}
    assert client.get(ROOT + "/menu/items", params={"q":"unicorn"}).json() == []
    assert client.get(ROOT + "/menu/items/not-verified").status_code == 404

def test_unknown_prices_are_never_zero():
    summary = summarize(cart(), RESTAURANT_CONFIG, CATALOG)
    assert summary.subtotal is None and summary.total is None and summary.tax is None
    assert summary.lines[0].unit_price is None
    assert "cannot quote" in summary.readback

def test_decimal_price_and_quantity_calculation():
    restaurant, menu = priced_fixture()
    summary = summarize(cart(quantity=2, added_topping_ids=["mushrooms"]), restaurant, menu)
    assert summary.subtotal == Decimal("22.50")
    assert summary.tax == Decimal("1.80")
    assert summary.total == Decimal("24.30")

def test_missing_customization_charge_or_tax_blocks_final_total():
    restaurant, menu = priced_fixture()
    assert summarize(cart(added_topping_ids=["pepperoni"]), restaurant, menu).subtotal is None
    restaurant.tax.rate = None
    summary = summarize(cart(), restaurant, menu)
    assert summary.subtotal == Decimal("10.00") and summary.total is None

@pytest.mark.parametrize("changes", [
    {"item_id":"unicorn"}, {"variation_id":"giant"},
    {"added_topping_ids":["unicorn"]}, {"removed_topping_ids":["mushrooms"]},
    {"add_on_ids":["extra-cheese"]}, {"item_id":"garlic-bread","variation_id":"large"},
])
def test_invalid_cart_customizations_rejected(changes):
    with pytest.raises(ValueError): summarize(cart(**changes), RESTAURANT_CONFIG, CATALOG)

@pytest.mark.parametrize("quantity", [0, -1, 21, 1.5, True])
def test_quantity_constraints(quantity):
    with pytest.raises(ValidationError): line(quantity=quantity)

def test_price_requires_explicit_verification_source():
    with pytest.raises(ValidationError): Option(id="fake", name="Fake", source_url="https://example.test", price="0.00")

def test_unavailable_item_and_topping_are_rejected():
    menu = CATALOG.model_copy(deep=True)
    menu.items[4].availability = "unavailable"
    with pytest.raises(ValueError): summarize(cart(), RESTAURANT_CONFIG, menu)
    menu.items[4].availability = "unknown"
    menu.toppings[1].availability = "unavailable"
    with pytest.raises(ValueError): summarize(cart(added_topping_ids=["mushrooms"]), RESTAURANT_CONFIG, menu)

def test_confirmation_requires_current_readback_and_is_only_a_demo():
    draft = create_draft(DraftRequest(cart=cart()), RESTAURANT_CONFIG, CATALOG)
    with pytest.raises(ValueError): create_draft(DraftRequest(cart=cart(),confirm=True), RESTAURANT_CONFIG, CATALOG)
    with pytest.raises(ValueError): create_draft(DraftRequest(cart=cart(quantity=2),confirm=True,review_token=draft.summary.review_token), RESTAURANT_CONFIG, CATALOG)
    confirmed = create_draft(DraftRequest(cart=cart(),confirm=True,review_token=draft.summary.review_token), RESTAURANT_CONFIG, CATALOG)
    assert confirmed.status == "demo_confirmed"
    assert not confirmed.submitted_to_restaurant and not confirmed.payment_processed

def test_voice_grammar_clarifies_pepperoni_and_keeps_size():
    result = turn("I want a large pepperoni pizza")
    assert not result.cart.lines and "Do you mean" in result.reply
    result = turn("create your own", result)
    assert result.cart.lines[0].variation_id == "large"
    assert result.cart.lines[0].added_topping_ids == ["pepperoni"]

def test_quantity_size_clarification_and_cart_commands():
    result = turn("Can I get two medium pizzas?")
    assert not result.cart.lines
    result = turn("king arthur", result)
    assert result.cart.lines[0].quantity == 2
    assert result.cart.lines[0].variation_id == "medium"
    result = turn("remove yellow onions", result)
    assert "yellow-onions" in result.cart.lines[0].removed_topping_ids
    assert not turn("remove the last item",result).cart.lines
    assert not turn("start over",result).cart.lines

def test_toppings_size_total_and_confirmation_flow():
    result = turn("large create your own pizza")
    result = turn("add mushrooms", result)
    assert result.cart.lines[0].added_topping_ids == ["mushrooms"]
    result = turn("make it medium",result)
    assert result.cart.lines[0].variation_id == "medium"
    assert "unverified" in turn("what's my total",result).reply
    assert "base recipe needs location confirmation" in turn("what's in this pizza", result).reply
    review = turn("confirm my order",result)
    assert review.draft is None and review.context.review_token
    confirmed = turn("confirm demo",review)
    assert confirmed.draft.status == "demo_confirmed"
    assert not confirmed.draft.submitted_to_restaurant

@pytest.mark.parametrize("text", ["large create your own pizza with unicorn", "add mushrooms and remove the last item", "I want a 14 inch pizza", "I want a large pizza under 5 dollars", "large create your own pizza half mushrooms half pepperoni", "large create your own pizza on garlic sauce"])
def test_unsupported_or_compound_requests_do_not_mutate_cart(text):
    assert not turn(text).cart.lines

def test_unsupported_extra_cheese_drinks_and_languages_are_honest():
    result = turn("large create your own pizza")
    for text in ["make it extra cheese", "add a drink", "remove onions"]:
        assert turn(text,result).cart == result.cart
    assert "English only" in turn("ਮੈਨੂੰ ਪੀਜ਼ਾ ਚਾਹੀਦਾ ਹੈ").reply

def test_quantities_do_not_confuse_product_size_numbers_with_counts():
    assert turn("add two garlic bread").cart.lines[0].quantity == 2
    assert turn("add 20 oz bottle").cart.lines[0].quantity == 1
    assert turn("add two 20 oz bottles").cart.lines[0].quantity == 2
    assert not turn("twenty one large create your own pizzas").cart.lines


def test_pizza_then_drink_asks_open_ended_followup():
    pizza = turn("large create your own pizza")
    result = turn("add 20 oz bottle", pizza)
    assert len(result.cart.lines) == 2
    assert result.cart.lines[0] == pizza.cart.lines[0]
    for added in [pizza, result]:
        assert added.reply.endswith("Would you like to add anything to the order?")
        assert "toppings or a drink" not in added.reply


@pytest.mark.parametrize("response", ["no", "no thanks", "no thank you", "nothing else", "that's all"])
def test_done_adding_reads_back_and_waits_for_yes(response):
    order = turn("add 20 oz bottle", turn("large create your own pizza"))
    review = turn(response, order)
    assert review.cart == order.cart
    assert review.draft is None
    assert review.context.review_token == review.summary.review_token
    assert review.summary.readback in review.reply and "Is this correct?" in review.reply
    confirmed = turn("yes", review)
    assert confirmed.draft.status == "demo_confirmed"
    assert not confirmed.draft.submitted_to_restaurant


def test_rejecting_readback_does_not_confirm_and_changes_require_review():
    review = turn("no", turn("large create your own pizza"))
    rejected = turn("no", review)
    assert rejected.cart == review.cart and rejected.draft is None
    assert rejected.context.review_token is None
    assert turn("yes", rejected).draft is None
    edited = turn("add 20 oz bottle", review)
    assert edited.context.review_token is None
    assert turn("yes", edited).draft is None


def test_no_cannot_confirm_empty_or_incomplete_order():
    assert turn("no").draft is None
    pending = turn("large pepperoni pizza")
    result = turn("no", pending)
    assert result.context.pending is not None and result.draft is None
    assert result.context.review_token is None


@pytest.mark.parametrize("text", [
    "add mushrooms and pineapple", "add mushrooms pineapple",
    "remove large create your own pizza", "I don't want large create your own pizza",
    "add 20 oz bottle and a coke", "add 20 oz bottle coke",
    "make it medium and quantity 2", "change size medium quantity 2",
])
def test_audit_unsupported_or_mixed_requests_never_partially_mutate(text):
    order = turn("large create your own pizza")
    result = turn(text, order)
    assert result.cart == order.cart
    assert result.draft is None


def test_audit_pending_item_blocks_review_confirmation_and_unrelated_additions():
    order = turn("large create your own pizza")
    pending = turn("I want a large pizza", turn("review order", order))
    assert pending.context.pending and pending.context.review_token is None
    for text in ["review order", "confirm my order", "confirm demo", "yes", "add 20 oz bottle"]:
        result = turn(text, pending)
        assert result.cart == order.cart and result.context.pending
        assert result.context.review_token is None and result.draft is None
    finished = turn("king arthur", pending)
    assert len(finished.cart.lines) == 2 and finished.context.pending is None


def test_audit_both_non_english_scripts_preserve_cart():
    order = turn("large create your own pizza")
    for language, text in [("pa-IN", "ਮੈਨੂੰ ਪੀਜ਼ਾ ਚਾਹੀਦਾ ਹੈ"), ("hi-IN", "मुझे पिज़्ज़ा चाहिए")]:
        result = handle_turn(TurnRequest(text=text, language=language, cart=order.cart, context=order.context), RESTAURANT_CONFIG, CATALOG)
        assert result.cart == order.cart and result.language == "en-US"
        assert "English only" in result.reply

def test_api_validation_summary_and_safe_drafts():
    body = cart().model_dump(mode="json")
    response = client.post(ROOT + "/cart/validate", json=body)
    assert response.status_code == 200 and response.json()["subtotal"] is None
    assert client.post(ROOT + "/orders/summary",json=body).status_code == 200
    assert client.post(ROOT + "/order-drafts",json={"cart":body,"confirm":True}).status_code == 422
    body["lines"][0]["price"] = "1.00"
    assert client.post(ROOT + "/cart/validate",json=body).status_code == 422
    response = client.post(ROOT + "/assistant/turn",json={"text":"large create your own pizza","cart":Cart().model_dump(mode="json")})
    assert response.status_code == 200 and response.json()["engine"] == "deterministic"
