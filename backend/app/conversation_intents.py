"""Exact conversational intents run before strict, bounded menu parsing.

These responses never add an item or change pricing. Unknown text is deliberately
left to the ordering engine, rather than being classified as a greeting.
"""
from dataclasses import dataclass
import re
from typing import Literal
from .ordering_schemas import Catalog


@dataclass(frozen=True)
class ConversationReply:
    text: str
    session_action: Literal["continue", "end"] = "continue"
    invalidate_review: bool = False


def normalize_utterance(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", text.casefold())).strip()


def menu_phrases(option) -> set[str]:
    phrases = {normalize_utterance(alias) for alias in [option.name, *option.aliases]}
    # Bounded possessive variants derived only from verified names, not fuzzy
    # spelling guesses: Arthur's / Arthur / Arthurs, Montague's / Montagues.
    return phrases | {re.sub(r"\b([a-z]+) s\b", r"\1", phrase) for phrase in phrases} | {re.sub(r"\b([a-z]+) s\b", r"\1s", phrase) for phrase in phrases}


def is_order_completion(text: str) -> bool:
    return bool(re.fullmatch(
        r"(?:(?:okay|ok|no|alright|all right) )?"
        r"(?:that(?: s| is|s) (?:everything(?: i want| for me)?|all(?: i want)?|it|my order)"
        r"|that will do(?: it)?|i(?: m| am|m) done(?: ordering)?|nothing else(?: for me)?)"
        r"(?: please| thanks| thank you)?", text))


def pending_pizza_candidates(text: str, menu: Catalog):
    """Whole-word contiguous name fragments, only in a pending pizza turn.

    A partial selection proposes verified candidates; it never mutates a cart.
    Exact multi-word names/aliases proceed through the ordinary strict parser.
    """
    phrase = re.sub(r"^(?:the|i mean|i meant) ", "", text)
    phrase = re.sub(r" please$", "", phrase)
    phrase = re.sub(r" pizza$", "", phrase)
    if not phrase or len(phrase.split()) > 4:
        return []
    candidates = [item for item in menu.items if item.kind == "pizza" and any(re.search(r"\b" + re.escape(phrase) + r"\b", alias) for alias in menu_phrases(item))]
    if len(candidates) == 1 and len(phrase.split()) > 1 and phrase in menu_phrases(candidates[0]):
        return []
    return candidates


def conversation_intent(text: str, menu: Catalog, active: bool = False) -> ConversationReply | None:
    named_greeting = re.fullmatch(r"(?:(?:hey|hi|hello) )?(?:coco|koko|cocoa)", text)
    # Specific ASR greeting confusion, never a Google/Google Pay replacement.
    google_greeting = active and bool(re.fullmatch(r"(?:hey|hello) google", text))
    if named_greeting or google_greeting or text in {"hey", "hi", "hello"}:
        return ConversationReply("Hi! Welcome to Round Table Pizza. What can I get started for you?")
    if text in {"how are you", "how are you coco", "coco how are you"}:
        return ConversationReply("I'm here and ready to help! What would you like to order?")
    if text in {"thank you", "thanks", "thank you coco", "thanks coco"}:
        return ConversationReply("You're welcome! Let me know if you need anything else.")
    if text in {"give me a minute", "give me a moment", "one moment", "wait", "hold on"} or re.fullmatch(r"(?:(?:could|can) you )?(?:give me|i need) (?:a|one) (?:minute|moment|second)(?: please)?", text):
        return ConversationReply("Of course. Take your time.")
    if re.fullmatch(r"i (?:think|believe) i (?:m|am) ready(?: now)?", text):
        return ConversationReply("Certainly. What would you like to order?")
    if text in {"i m ready", "im ready", "i am ready", "okay i m ready", "ok i m ready", "okay im ready", "ok im ready", "okay i am ready", "okay ready", "i am ready now", "i m ready now"}:
        return ConversationReply("Perfect! What would you like?")
    if text in {"what can you do", "what can you do coco", "help", "help me"}:
        return ConversationReply("I can help you explore the verified menu, choose a pizza and size, change listed toppings, update your cart, and read back a demo order. Prices need location verification, and I cannot place real orders. What would you like help with?")
    if text in {"what do you recommend", "what do you recommend coco", "any recommendations"}:
        choices = [item for item in menu.items if item.category_id == "specialty" and item.availability != "unavailable"][:3]
        if not choices:
            return ConversationReply("Let's explore the verified menu together. I don't have a verified specialty selection to suggest right now. What kind of pizza are you looking for?")
        return ConversationReply("You could consider " + ", ".join(item.name for item in choices) + ". Which would you like to hear about? Local prices and availability still need confirmation.")
    if text in {"cancel", "cancel please"}:
        return ConversationReply("Would you like to clear your draft or end the conversation? Say 'clear cart' or 'goodbye'. I have not changed your cart or confirmed anything.", invalidate_review=True)
    if text in {"goodbye", "goodbye coco", "bye", "bye coco", "end conversation", "end the conversation"}:
        return ConversationReply("Goodbye! Your draft stays in this tab. No restaurant order was placed. Choose Start Conversation whenever you want to talk again.", session_action="end")
    return None
