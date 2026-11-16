from app import conversation_service as service
from app.catalog import CATALOG, RESTAURANT_CONFIG
from app.local_model import ModelUnavailable
from app.model_schemas import ConversationPlan
from app.ordering_schemas import Cart, OrderingContext, TurnRequest


def say(text, previous=None, **kwargs):
    return service.conversation_turn(TurnRequest(
        text=text, conversation_active=True,
        cart=previous.cart if previous else Cart(),
        context=previous.context if previous else OrderingContext(),
        **kwargs,
    ), RESTAURANT_CONFIG, CATALOG)


def test_session_from_greeting_to_demo_confirmation(monkeypatch):
    monkeypatch.setenv("COCO_FAST_ORDERING", "true")
    welcome = say("Hey Coco")
    assert "Welcome" in welcome.reply
    pending = say("I'd like a large pizza", welcome)
    assert pending.context.pending.variation_id == "large"
    waited = say("Could you give me a second?", pending)
    assert "Take your time" in waited.reply
    ready = say("I think I'm ready", waited)
    assert ready.context.pending.variation_id == "large"
    named = say("King Arthur Supreme", ready)
    assert named.cart.lines[0].variation_id == "large"
    second = say("medium create your own with mushrooms", named)
    assert len(second.cart.lines) == 2
    first = say("Make the first pizza medium", second)
    assert [line.variation_id for line in first.cart.lines] == ["medium", "medium"]
    review = say("That's everything", first)
    assert review.context.review_token and review.draft is None
    rejected = say("No", review)
    assert not rejected.context.review_token and rejected.cart == review.cart
    corrected = say("Actually, make the second one large", rejected)
    assert [line.variation_id for line in corrected.cart.lines] == ["medium", "large"]
    assert corrected.cart.lines[1].added_topping_ids == ["mushrooms"]
    rereview = say("That's all", corrected)
    confirmed = say("Yes", rereview)
    assert confirmed.draft.status == "demo_confirmed"
    assert not confirmed.draft.payment_processed and not confirmed.draft.submitted_to_restaurant
    assert confirmed.summary.total is None


def test_atomic_independent_additions_and_failed_batch(monkeypatch):
    monkeypatch.setenv("COCO_FAST_ORDERING", "true")
    invalid = say("medium King Arthur Supreme and create your own with unicorn")
    assert not invalid.cart.lines
    assert invalid.reply.count("?") == 1
    good = say("medium King Arthur Supreme and large create your own with mushrooms")
    assert [(line.item_id, line.variation_id) for line in good.cart.lines] == [
        ("king-arthur", "medium"), ("create-your-own", "large"),
    ]
    assert good.cart.lines[1].added_topping_ids == ["mushrooms"]


def test_pending_change_of_mind_and_ambiguous_reference(monkeypatch):
    monkeypatch.setenv("COCO_FAST_ORDERING", "true")
    pending = say("King Arthur Supreme")
    assert pending.context.pending.item_id == "king-arthur"
    other = say("Actually, create your own instead", pending)
    assert not other.cart.lines and other.context.pending.item_id == "create-your-own"
    first = say("large", other)
    second = say("medium King Arthur Supreme", first)
    second.context.target_line_id = None
    clarification = say("Make that large", second)
    assert clarification.cart == second.cart
    assert clarification.context.pending_edit
    assert clarification.reply.count("?") == 1
    blocked = say("That's all", clarification)
    assert blocked.draft is None and not blocked.context.review_token
    resolved = say("The second one", blocked)
    assert resolved.cart.lines[1].variation_id == "large"


def test_duplicate_requires_intention_and_review_is_separate(monkeypatch):
    monkeypatch.setenv("COCO_FAST_ORDERING", "true")
    first = say("large King Arthur Supreme")
    repeat = say("large King Arthur Supreme", first)
    assert repeat.cart == first.cart and repeat.context.duplicate_line_id
    another = say("Another one please", repeat)
    assert len(another.cart.lines) == 2 and not another.context.duplicate_line_id
    review = say("That's all", repeat)
    assert review.context.review_token and not review.context.duplicate_line_id
    confirmed = say("yes", review)
    assert len(confirmed.cart.lines) == 1
    assert confirmed.draft.status == "demo_confirmed"


def test_model_can_resolve_flexible_ordinal_only_when_proposal_matches(monkeypatch):
    monkeypatch.setenv("COCO_FAST_ORDERING", "true")
    second = say("medium King Arthur Supreme and small create your own")
    monkeypatch.setenv("COCO_MODEL_ENABLED", "true")
    monkeypatch.setattr(service, "plan_turn", lambda *_: ConversationPlan(intent="size", variation_id="large", target_line_id=second.cart.lines[0].line_id))
    phrase = "Could we go with large for the second one instead?"
    rejected = say(phrase, second)
    assert rejected.cart == second.cart and rejected.fallback_reason == "rejected"
    monkeypatch.setattr(service, "plan_turn", lambda *_: ConversationPlan(intent="size", variation_id="large"))
    accepted = say(phrase, second)
    assert accepted.engine == "local-model"
    assert [line.variation_id for line in accepted.cart.lines] == ["medium", "large"]


def test_model_timeout_is_measured_and_leaves_cart_unchanged(monkeypatch):
    monkeypatch.setenv("COCO_FAST_ORDERING", "true")
    first = say("large King Arthur Supreme")
    monkeypatch.setenv("COCO_MODEL_ENABLED", "true")
    def timeout(*_):
        raise ModelUnavailable("test timeout", "timeout")
    monkeypatch.setattr(service, "plan_turn", timeout)
    fallback = say("Could you fix that thing from earlier?", first)
    assert fallback.fallback_reason == "timeout"
    assert fallback.inference_ms >= 0 and fallback.engine == "deterministic"
    assert fallback.cart == first.cart and fallback.reply.count("?") == 1


def test_model_cannot_add_from_a_menu_question_or_guess_between_sizes(monkeypatch):
    monkeypatch.setenv("COCO_FAST_ORDERING", "true")
    first = say("medium King Arthur Supreme")
    monkeypatch.setenv("COCO_MODEL_ENABLED", "true")
    monkeypatch.setattr(service, "plan_turn", lambda *_: ConversationPlan(intent="add", item_id="king-arthur", variation_id="large"))
    question = say("Do you have large King Arthur Supreme?", first)
    assert question.cart == first.cart and question.fallback_reason == "rejected"
    monkeypatch.setattr(service, "plan_turn", lambda *_: ConversationPlan(intent="size", variation_id="large"))
    choice = say("Could we switch it to small or large?", first)
    assert choice.cart == first.cart and choice.fallback_reason == "rejected"
