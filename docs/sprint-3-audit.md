# Coco Sprint 3 implementation audit — 2026-11-03

This is the original audit snapshot. Subsequent manual testing revealed session and greeting defects; the fixes, current test results and still-required manual sign-off are documented in [voice conversation fixes](sprint-3-voice-conversation-fixes.md). Its session policy and test counts supersede the original one-shot behavior/counts below. Sprint 3 remains unapproved for completion.

Verdict: **NOT READY for complete Sprint 3 sign-off until the manual microphone and audible playback checks below are completed.** Automated implementation checks pass after the fixes described here. No known code defect remains from this audit; the outstanding voice evidence requires a human using a microphone and speakers. This is a local demo, not a restaurant ordering system.

Audited repository: `C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI`, branch `main`, HEAD `d75cbf2`. Inspected source, data, schemas, provider boundaries and actual browser behavior at http://127.0.0.1:3000. Tests also launched isolated development servers on ports 3210/8010, and a temporary production server on 3211. The temporary servers were stopped; the user's running application was left running. No commit, push, deployment or other repository modification was performed.

## Requirement results

| # | Requirement | Result | Evidence and limits |
| --- | --- | --- | --- |
| 1 | Replace sample menu experience | PASS | Live dashboard requests `round-table` configuration/catalog and displays 12 entries, 8 categories and 9 topping options. `loadFoundation` and `EMPTY_CART` use `round-table`. Legacy `/demo` sample endpoints remain explicitly labeled for Sprint 1 compatibility and are not used by the dashboard. |
| 2 | Categories, search, sizes, toppings, availability | PASS | Live category counts: specialty 4, create-your-own 1, sides 2, wings 2, salads 1, desserts 1, beverages 1, deals 0. `garlic` finds 2 entries; an unknown term finds 0. All five pizza size names are selectable. Customization and quantities update the cart. Real stock is unknown and labeled accordingly. Browser response fixtures verify unavailable item, size and topping controls; backend tests reject unavailable catalog options. These fixtures do not claim real stock. |
| 3a | Microphone permission/error handling | PASS | Real Edge SpeechRecognition API was present. CDP denied microphone permission; clicking Coco's mic triggered its actual permission-denied message, left typing available and returned the avatar to idle. Unit/browser event tests also cover interim/final results, no automatic restart, abort, unsupported browsers and error fallback. |
| 3b | Physical microphone speech recognition | NOT TESTED | No customer speech was captured. Successful hardware capture, recognition accuracy, real Stop listening/final-result behavior and network-dependent speech service reliability require manual testing. Simulated recognition results are not evidence of physical capture. |
| 4a | Spoken responses and controls | PASS | Actual native SpeechSynthesis used installed local Microsoft Zira. During playback `speechSynthesis.speaking` was true and avatar state was speaking. Stop speaking made it false and restored idle. Unit/browser tests cover no overlap, late events, explicit voice override, speech errors, missing-language voice, speech toggle and stop. |
| 4b | Audible playback and perceived voice quality | NOT TESTED | Native browser playback events do not prove speakers were audible or the voice sounded natural. A human must listen. No paid TTS dependency is installed. |
| 5 | Text ordering, customization, cart, summary | PASS | Live app: two large create-your-own pizzas with mushrooms, size changed to medium, quantity changed to three, bottle added, itemized readback, no/yes demo confirmation. Direct text send starts a session; typing remains available while offline. Backend/browser regressions verify unsupported requests cannot partially mutate the cart and pending items cannot be skipped at confirmation. |
| 6 | Unknown prices are not zero | PASS | All 12 imported item prices and every variation/topping price are null. Nonempty unknown-price carts return null subtotal/tax/total, with warnings and no quoted final price. Live cart shows Unverified, not $0.00. Synthetic test-only prices verify Decimal arithmetic and tax without inserting invented real prices. An empty cart may correctly have a zero subtotal; that is not an unknown item price. |
| 7 | Demo-only confirmation | PASS | No reads back and asks Is this correct; Yes confirms only after current review. Edits invalidate the review. Rejection cancels confirmation. Incomplete selections block review. Draft status is demo_confirmed, submitted_to_restaurant=false and payment_processed=false. Code has no restaurant/POS/payment adapter or outbound order submission. Drafts are stateless, not persisted. |
| 8 | Avatar states | PASS | Browser tests verify listening from recognition start, thinking during an API request, speaking from audio start and idle after end/stop. Actual native synthesis also changed speaking/idle. Positive listening uses controlled recognition events; physical listening remains covered by manual check 3b. Private portrait/reduced-motion/mobile tests pass; this is whole-image presentation, not blinking, facial rigging or lip-sync. |
| 9 | Actual language support | PASS for requested foundation | English parsing/replies work with a bounded deterministic grammar. Both Punjabi pa-IN and Hindi hi-IN are selectable and have short written greetings. Native-script orders in either language return an English-only explanation without changing the cart. This Edge session exposed only David, Mark and Zira English voices: Punjabi/Hindi audio greetings are unavailable here and trigger the missing-voice fallback. Full Punjabi/Hindi recognition, parsing and responses are not implemented or claimed. |
| 10 | Required checks | PASS | Frontend ESLint, npm run typecheck, production build, 25 frontend unit tests and 55 backend pytest tests pass. Python pip check and ASGI import pass. Final browser suite: 14 passed. |
| 11 | Browser runtime errors | PASS | Real Edge session at port 3000 recorded zero page exceptions, zero console errors and zero failed API responses across the audited normal flows. Three additional persistent browser audit tests fail on page errors/console errors and pass. Expected simulated permission/offline failures are distinguished from unexpected runtime failures. |
| 12 | Git/private asset checks | PASS | Full modified/untracked inventory is below. Nothing staged or committed. Portrait, screenshots and temporary live-audit artifacts are ignored; no private-assets files are tracked. Git diff whitespace check passes. |

## Source verification and data gaps

Reopened the [official national menu](https://www.roundtablepizza.com/menu/) and the [official August 2024 ingredient guide](https://www.roundtablepizza.com/wp-content/uploads/2024/08/Round-Table-Pizza-Nutritional-Information-Guide-August.pdf) during this audit. Compared imported item/ingredient/variation data against those sources rather than relying on the README. Category names are Coco's normalized navigation groups, not a claim that the official website uses identical headings.

The curated subset contains King Arthur’s Supreme, Montague’s All Meat Marvel, Guinevere’s Garden Delight, Double Play Pepperoni Pizza, Create Your Own Pizza, Garlic Parmesan Twists, Garlic Bread, Classic Wings, Boneless Wings, Garden Salad, Churro Twists and 20 OZ Bottles. Pizza sizes are Personal, Small, Medium, Large and X-Large; wing counts are 6/12/24 and salad options Individual/Family. The dated guide supports the create-your-own category and the nine imported topping names; it does not verify current local customization availability or the base recipe.

Still missing: store/location/address, local prices, customization charges, tax treatment, stock, beverage brands/flavors, current promotions and local customization rules. Extra cheese, half-and-half, sauce/crust changes and unsupported options are rejected or explained. This is not the complete national menu. No menu photographs were downloaded. No invented local deal or charge was introduced.

## Defects reproduced and fixed

The initial 45-test backend suite passed but did not cover these defects. The audit reproduced them against the actual engine before changing code:

1. `add mushrooms and pineapple` applied just mushrooms even though the whole request was not supported. Similarly `add 20 oz bottle and a coke` silently ignored Coke. The engine now rejects compound or unmatched modifiers without changing the cart. The UI still supports multiple explicit topping selections.
2. `remove large create your own pizza` entered the item-add path and added a pizza. Named removal/negative requests now refuse that fallback and explain the supported remove controls/last-item command.
3. `make it medium and quantity 2` applied only the size. Mixed size/quantity changes now require separate turns.
4. A pending new pizza could be ignored by `confirm my order` followed by `yes`. Pending choices now clear old review tokens, block engine confirmation and hide/disable the cart review/confirmation controls. Adding a different item cannot silently replace the pending choice.

Added 10 backend regression cases (including both non-English scripts) and 3 persistent browser audit tests. Final backend count is 55 and browser count is 14. Two first-run browser audit assertions were corrected: native option disabled state is checked as a DOM property, and unchanged cart text is compared consistently. A nullable text-content type error in the new test was also fixed. No failing check from those test-authoring issues remains. No unrelated dependency upgrades were made.

## Production and privacy smoke check

The current production build served `/` with HTTP 200. The development avatar preview panel was absent. `/api/avatar/reference` returned 404 with `private, no-store, max-age=0`; production trace files contained zero private-assets references. The original portrait stayed in ignored private storage and was not changed, sent to the ordering backend, committed or published.

The installed browser exposed three local en-US voices: Microsoft David, Microsoft Mark and Microsoft Zira. Native playback testing explicitly selected Zira; unit tests separately verify that Coco's default prefers the known female name and respects manual overrides. The Web Speech API does not expose gender metadata, so available female voices cannot be guaranteed on other machines.

Ignored local evidence is saved under `C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/private-assets/`: `sprint3-live-audit.json`, a repeatable `sprint3-live-audit.cjs` script, desktop/mobile screenshots and Playwright output. Screenshots include the private portrait and must not be published.

## Remaining manual browser tests

At http://127.0.0.1:3000 in the intended browser/device:

1. Start Conversation, allow the microphone, and actually speak `I want a large pepperoni pizza`; verify the heard transcript, clarification, listening indicator and one-shot stop. Say `create your own`, then `add mushrooms`, `add 20 oz bottle`, `no`, and finally `yes` after the readback. Confirm both cart contents and the demo-only result.
2. Speak a partial request and press Stop listening. Verify final/interim handling; test silence, permission revocation and a disconnected speech service. Confirm there is no continuous listening or automatic restart.
3. Select Microsoft Zira, enable Spoken responses and listen to the greeting and readback. Verify volume, intelligibility and the preferred female presentation. Interrupt playback with Stop speaking, mic, a typed message, speech off and End Conversation; verify no overlapping audio or stuck avatar state.
4. Repeat the basic typed/voice flow on a phone or the target mobile browser. Desktop Edge headless viewport testing is not a physical mobile-device test.
5. Punjabi/Hindi full ordering is outside Sprint 3. Only test locale/greeting fallback unless suitable voices are installed; do not interpret a selectable locale as full multilingual support.

## Reproduce automated checks

```powershell
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI\frontend'
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build

Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI\backend'
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m pip check
```

The live audit requires the normal frontend/backend to already run on ports 3000/8000; the Playwright suite manages its own isolated servers. No API keys or paid services are required.

## Git inventory

Paths below are the complete modified/untracked set at the end of this audit. `M` means modified and `??` means untracked. All remain unstaged. Ignored personal assets and generated test/build output are intentionally excluded.

| Status | File |
| --- | --- |
| M | [.gitignore](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/.gitignore) |
| M | [README.md](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/README.md) |
| M | [backend/app/contracts.py](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/backend/app/contracts.py) |
| M | [backend/app/main.py](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/backend/app/main.py) |
| M | [backend/app/schemas.py](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/backend/app/schemas.py) |
| M | [backend/tests/test_api.py](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/backend/tests/test_api.py) |
| M | [docs/architecture.md](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/docs/architecture.md) |
| M | [frontend/eslint.config.mjs](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/eslint.config.mjs) |
| M | [frontend/next.config.ts](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/next.config.ts) |
| M | [frontend/playwright.config.ts](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/playwright.config.ts) |
| M | [frontend/src/app/globals.css](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/src/app/globals.css) |
| M | [frontend/src/app/layout.tsx](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/src/app/layout.tsx) |
| M | [frontend/src/components/assistant-dashboard.tsx](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/src/components/assistant-dashboard.tsx) |
| M | [frontend/src/components/avatar-display.tsx](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/src/components/avatar-display.tsx) |
| M | [frontend/src/components/avatar-experience.tsx](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/src/components/avatar-experience.tsx) |
| M | [frontend/src/features/contracts.ts](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/src/features/contracts.ts) |
| M | [frontend/src/lib/api.ts](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/src/lib/api.ts) |
| M | [frontend/tests/avatar.spec.ts](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/tests/avatar.spec.ts) |
| M | [frontend/tsconfig.json](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/tsconfig.json) |
| ?? | [backend/app/cart_service.py](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/backend/app/cart_service.py) |
| ?? | [backend/app/catalog.py](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/backend/app/catalog.py) |
| ?? | [backend/app/ordering_engine.py](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/backend/app/ordering_engine.py) |
| ?? | [backend/app/ordering_routes.py](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/backend/app/ordering_routes.py) |
| ?? | [backend/app/ordering_schemas.py](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/backend/app/ordering_schemas.py) |
| ?? | [backend/data/round-table.json](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/backend/data/round-table.json) |
| ?? | [backend/tests/test_ordering.py](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/backend/tests/test_ordering.py) |
| ?? | [docs/sprint-3-audit.md](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/docs/sprint-3-audit.md) |
| ?? | [docs/sprint-3-voice-ordering.md](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/docs/sprint-3-voice-ordering.md) |
| ?? | [frontend/src/components/menu-browser.tsx](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/src/components/menu-browser.tsx) |
| ?? | [frontend/src/components/order-cart.tsx](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/src/components/order-cart.tsx) |
| ?? | [frontend/src/features/ordering/browser-voice.test.ts](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/src/features/ordering/browser-voice.test.ts) |
| ?? | [frontend/src/features/ordering/browser-voice.ts](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/src/features/ordering/browser-voice.ts) |
| ?? | [frontend/src/features/ordering/languages.ts](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/src/features/ordering/languages.ts) |
| ?? | [frontend/src/features/ordering/use-browser-voice.ts](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/src/features/ordering/use-browser-voice.ts) |
| ?? | [frontend/src/features/ordering/use-order-session.ts](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/src/features/ordering/use-order-session.ts) |
| ?? | [frontend/tests/audit.spec.ts](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/tests/audit.spec.ts) |
| ?? | [frontend/tests/ordering.spec.ts](C:/Users/mkghu/Documents/Portfolio-Projects/Coco-AI/frontend/tests/ordering.spec.ts) |
