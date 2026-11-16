# Sprint 3 — Real customer transcript regressions

The real customer transcript was reproduced against the local ordering API and added to backend/browser regressions. No microphone session policy, private portrait route, real menu items/prices, payment/POS integration or dependency was changed. All work remains uncommitted. Sprint 3 still needs manual spoken-session verification.

## Bounded intent changes

- Coco, Koko and Cocoa are accepted as names in whole greeting phrases, including Hey/Hi/Hello variants. Normalization tolerates capitalization, whitespace, punctuation and straight/curly apostrophes.
- Only the whole phrases `hey Google` and `hello Google` receive the ASR greeting-confusion treatment, and only when `TurnRequest.conversation_active=true`. The frontend sets this flag for an explicitly submitted conversation turn, including a typed message that starts a text session. It is a UX context hint, not an authorization boundary. No background/page-load speech is enabled by this flag.
- Google is never globally replaced. Google Pay, questions about Google, and a greeting mixed with an ordering/payment request do not match the greeting rule. Customer transcript text remains the original received text.
- While a pizza choice is pending, a short whole-word contiguous fragment of a verified pizza name can produce a proposal. Supreme currently proposes King Arthur’s Supreme and asks for yes or its full name. No item is added by the proposal. If several verified items match, Coco lists them and requires a full choice; bare yes cannot pick arbitrarily.
- Suggestions use `PendingItem.choice_item_ids`, retaining quantity, size and toppings. Yes to a single item proposal selects that item; it does not confirm an order. No declines the proposal while retaining the pending size. Greetings, waiting and readiness do not erase the pending choice.
- Full names/aliases, including bounded possessive variants derived from catalog names (Arthur's / Arthur / Arthurs), use the ordinary strict parser. There is no edit-distance or general fuzzy name matching.
- Successful add replies now state quantity, size and full item name: `Added 1 Large King Arthur’s Supreme ...`.
- A missing or marked-unavailable size is not replaced by a default. Coco retains the requested size, asks for an explicitly supported alternative and adds nothing until a valid choice is provided.
- Completion matching uses a bounded grammar, not a phrase-prefix or substring check. It supports That's everything, That's everything I want, That's all, That's it, I'm done, Nothing else, No that's all and That's my order, plus limited polite wrappers and apostrophe variants. Unknown trailing products/options are not silently discarded. A pending selection blocks readback/confirmation until finished.

## Actual local API transcript result

Executed against the running API at http://127.0.0.1:8000 with the original customer strings and `conversation_active=true`:

| Customer | Verified response/state |
| --- | --- |
| hey Google | Friendly Round Table greeting; empty cart. |
| hello Google | Friendly Round Table greeting; empty cart. |
| I want a large pizza | Which pizza would you like? Pending size is large, quantity 1. |
| Supreme | Would you like King Arthur’s Supreme? Requested Large is retained; cart remains empty. |
| King Arthur Supreme | Adds exactly 1 Large King Arthur’s Supreme and explicitly speaks Large. |
| that's everything I want | Reads back `1 × Large King Arthur’s Supreme`, explains unverified total and asks Is this correct? Nothing confirmed yet. |
| yes | Confirms only a demo draft. No restaurant submission or payment. |

Actual final cart fields:

```json
{
  "restaurant_id": "round-table",
  "lines": [
    {
      "item_id": "king-arthur",
      "quantity": 1,
      "variation_id": "large",
      "added_topping_ids": [],
      "removed_topping_ids": [],
      "add_on_ids": []
    }
  ]
}
```

The API also generates a per-line UUID; omitted above because it changes each run. Subtotal/tax/total remain null. Before the final yes, draft is null and a current review token is present. After yes, status is demo_confirmed, submitted_to_restaurant=false and payment_processed=false. The cart does not gain a second pizza when the proposal is clarified by full name.

Ignored local evidence and the repeatable HTTP regression script are under private-assets/customer-transcript-result.json and private-assets/customer-transcript-check.cjs. They contain test text and API responses, not microphone recordings. The browser regression independently checks the displayed customer transcript verbatim and asserts the returned cart fields through the real local backend.

## Verification

New backend cases cover the exact transcript, active/inactive Google greeting context, Google/Google Pay exclusions, name variants, multiple Supreme candidates, suggestion yes/no, pending context through greetings/waiting/readiness, completion variants, incomplete selections, unsupported/unavailable size alternatives, unknown modifiers and possessive name variants. Synthetic extra menu items exist only inside ambiguity tests; no invented menu data is imported.

The added browser regression feeds the exact recognized strings into the existing speech-event harness. It verifies original transcript rendering, microphone resume between turns, proposal without cart mutation, one large pizza, readback before yes, demo-only confirmation, no page exceptions and End Conversation. Existing microphone retry/mute/speech controls retain their regression suites.

Final verification on 2026-11-03:

| Check | Result |
| --- | --- |
| Frontend lint | PASS |
| TypeScript | PASS |
| Production build | PASS |
| Backend pytest | 117 passed |
| Frontend unit tests | 47 passed |
| Browser tests | 17 passed, including existing microphone/session/speech controls |
| Exact transcript through running API on port 8000 | PASS; one large King Arthur pizza, readback before yes, demo-only confirmation after yes |
| Git whitespace/private-asset checks | PASS; no staged changes, commits or pushes |

Implementation changes are confined to backend conversation-intent/name matching, pending-choice/turn schemas and ordering replies; the frontend sends the explicit conversation-active hint and types the optional pending choice list. New backend coverage is in backend/tests/test_customer_speech.py, and the exact ASR/browser regression is in frontend/tests/ordering.spec.ts. No real menu item, price or microphone controller was modified.

## Manual follow-up

Refresh http://127.0.0.1:3000, start a conversation and speak the exact transcript above. Confirm the original ASR words remain visible, Supreme produces a proposal, Large is spoken and selected, and That's everything I want leads to readback. Repeat with Koko/Cocoa, waiting/readiness between size and pizza choice, and a real pause before each reply. Confirm speech playback is never captured as customer text and mic mute/stop/end still work. Automated event injection does not establish microphone accent accuracy, acoustic echo behavior or uninterrupted hardware capture. No real order is placed.
