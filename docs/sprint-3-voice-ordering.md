# Sprint 3 — Voice ordering and the Round Table catalog

## What is implemented

Coco is now a local, deterministic English ordering assistant with optional browser voice input/output. It is **not a conversational LLM**, a restaurant POS, or a payment service. No paid API, new runtime dependency, database, Docker service, or third-party menu photograph is required.

The approved plum/rose/champagne styling and private user-supplied portrait are preserved. Menu search, category navigation, customization, quantities, editable cart lines, server-calculated pricing, order readback, and two-step demo confirmation are functional. The transcript contains actual customer inputs and actual deterministic replies. It is not a prewritten fake conversation.

The legacy `/api/v1/restaurants/demo` and `/demo/menu` endpoints remain available with explicitly fictional Sprint 1 data for compatibility. The dashboard and ordering engine use **only** the new `round-table` catalog, not those sample prices.

## Official sources and imported items

Catalog checked on **2026-11-03**. The import is a verified subset, not a claim to represent every menu item or a particular store's stock.

1. [Official national menu](https://www.roundtablepizza.com/menu/): item names, ingredient facts, pizza size names, wing portion counts, individual/family salad choices, and the bottled-beverage listing.
2. [Official August 2024 nutrition/ingredient guide](https://www.roundtablepizza.com/wp-content/uploads/2024/08/Round-Table-Pizza-Nutritional-Information-Guide-August.pdf): the create-your-own category and named ingredient options. This is a dated source; current local customization rules are **not** assumed from it.

Imported specialty pizzas: King Arthur’s Supreme, Montague’s All Meat Marvel, Guinevere’s Garden Delight, and Double Play Pepperoni Pizza. Other imported entries: Create Your Own Pizza, Garlic Parmesan Twists, Garlic Bread, Classic Wings, Boneless Wings, Garden Salad, Churro Twists, and 20 OZ Bottles. There are 12 entries in total. Descriptions are brief factual summaries; no copyrighted menu photography was downloaded or used.

The catalog includes the verified pizza size names Personal, Small, Medium, Large, and X-Large. It omits unimplemented crust/dietary variants rather than making gluten-free claims. Wings have documented 6/12/24-count choices. Garden Salad has Individual/Family choices. No inferred counts were assigned to the other sides or desserts.

Nine documented toppings are imported: pepperoni, mini pepperoni, mushrooms, yellow onions, red onions, green peppers, black olives, salami, and Italian sausage. Specialty ingredient facts and removable included toppings are separately modeled. The create-your-own **base recipe is not assumed** just because ingredients appear in the guide. Extra-cheese portions, half-and-half, crust/sauce changes and add-on charges remain unverified and are rejected or explained instead of invented.

Deals/Combos has an explicit empty state. No local promotion has been imported. National catering bundles are outside this curated subset; prices from arbitrary locations or third-party delivery sites were not generalized.

## Structured data and missing information

`backend/data/round-table.json` contains restaurant ID/name, nullable address/location, menu version, currency, categories, item IDs/names/descriptions/ingredients, variations, toppings, add-on references, source URLs, availability, nullable prices, tax and promotions. `ordering_schemas.py` validates the file, unique IDs and references. Restaurant and catalog ID/version must match. Restart the backend after changing JSON data; Python-only reload watchers do not reliably watch JSON.

All imported prices are `null`. A non-null price requires `price_source_url`. A non-null tax rate requires a source. All local availability is `unknown`, not falsely advertised as in stock. Such entries can be explored as **demo drafts**, with warnings; `unavailable` entries/options cannot be added.

Before quoting real prices or accepting a real order, obtain and verify:

- The exact restaurant location, ID, address, and current local menu/version.
- Prices for every size/variation, toppings, removals and add-ons, including relevant price rules.
- Availability, allowed customizations, extra portions, crusts, sauces and beverage brands/flavors.
- Applicable tax rate and policy, discounts, fees and verified local promotions.
- Allergen/cross-contact information directly from the restaurant; Coco makes no dietary safety guarantees.

No address, current price, deal or tax rate is guessed. To import a supplied menu file, map its facts into this schema, attach provenance, preserve nulls for missing facts, update the version, restart, and run the tests. Do not copy synthetic prices from tests into the catalog.

## Cart and order safety

`cart_service.py` is the pricing authority. Requests contain only item/variation/customization IDs and quantities; extra price fields are rejected. Quantity is a strict integer from 1 to 20 per line; at most 25 uniquely identified lines are accepted. Unknown IDs, unavailable entries and invalid modifications are rejected. Included toppings can be removed; unverified extra portions are not treated as free.

Known values use Decimal arithmetic with cent rounding for additive tax. Unknown base prices, customization charges, removal pricing or tax keep dependent totals null. Missing prices are never treated as zero. The UI displays **Unverified**, not $0.00. Existing real catalog prices are all unknown; numeric calculation tests use explicitly synthetic fixtures only. The simple additive-tax calculation is a tested foundation, not a verified local tax policy.

Review returns an itemized readback and a fingerprint of the validated cart, menu version and pricing. Confirmation requires the same current fingerprint. An edit invalidates the review and requires a new readback. This token prevents stale-cart mistakes; it is not authentication or cryptographic proof that a person read the text.

After adding items, Coco asks whether the customer wants anything else. Saying `no`, `no thanks`, `no thank you`, `nothing else` or `that's all` reads back the cart and asks “Is this correct?” without confirming. Coco waits for `yes` (or `yes please`/`confirm demo`) before confirming the local demo draft. Saying `no` to that readback cancels the pending confirmation and asks what to change. Empty carts and incomplete item choices cannot be confirmed through this flow. This works for both typed and recognized speech requests.

Confirmed responses are `demo_confirmed`, with `submitted_to_restaurant=false` and `payment_processed=false`. They explicitly say no restaurant order was placed. Draft IDs are ephemeral response identifiers, not POS tickets. There is no restaurant submission code, checkout, payment processing or persistent order database. Cart, context and transcript live in this browser tab's memory; refreshing clears them. End Conversation stops media/pending work while retaining the last validated cart in the tab.

## Deterministic conversation flow

`ordering_engine.py` recognizes a deliberately bounded grammar using the catalog as its source of truth. It carries pending quantity/size choices through clarification rather than guessing an item. Examples:

```text
I want a large pepperoni pizza.
  → asks whether Double Play or Create Your Own with pepperoni
create your own
add mushrooms
make it medium
what's in this pizza?
what's my total?
confirm my order
  → itemized readback; no submission
confirm demo
  → local demo confirmation only
```

Also supported: `Can I get two medium pizzas?` (asks which pizza), `remove yellow onions`, `remove the last item`, `make it 2`, `start over`, and `edit item 2` before a targeted change. The cart selector explicitly selects an item for voice edits. Generic onions require red/yellow clarification; Double Play pepperoni removal requires classic/mini clarification. Extra cheese and unverified drinks/flavors are explained without silently changing the cart. A generic `20 OZ Bottles` draft can be added by its verified name, without a fabricated brand or flavor. Multi-action/half-and-half requests are rejected or clarified, not partially applied without notice.

This is a limited grammar, not general natural-language understanding. If it cannot safely parse a request, use the menu/cart controls or rephrase one action at a time.

## Voice implementation and browser limits

`BrowserVoice` adapts standard/prefixed SpeechRecognition and SpeechSynthesis. It never calls MediaRecorder, saves audio files, or starts the microphone on page load. **Start Conversation explicitly consents to a voice session**, with automatic restart after normal browser ends and Coco's replies. Resume microphone is another explicit consent action. Each underlying recognition instance uses `continuous=false`; the controller maintains the logical session until End Conversation or Goodbye. It pauses for processing, synthesis, manual stop/mute, disconnection and exhausted/fatal errors. See docs/sprint-3-voice-conversation-fixes.md for exact backoff, lifecycle safeguards and manual checks. Final text is sent to the local ordering backend; interim text never changes the cart.

- Microphone permission, missing input devices, network/service errors, no speech and unsupported languages have readable fallbacks.
- Unsupported recognition leaves manual text ordering available. Localhost is used for the browser's secure-context requirements.
- Stop listening disables automatic resume and stops the current recognizer; mute aborts it. Both discard late results, including incomplete utterances, and remain paused until explicit Resume microphone. End Conversation stops recognition, synthesis and restart scheduling.
- Playback prefers a matching known female voice (local first, such as Microsoft Zira), then falls back to available matching voices. Web Speech has no gender metadata, so this uses known voice names and cannot guarantee a female voice on every device. Users can choose a voice, turn speech off, or stop it immediately. Voices vary in quality and are not guaranteed to sound human-like.
- Prior playback is cancelled before new playback or recognition. Speaking state begins on the utterance's actual `onstart` and ends on end/error/cancel, not on a fake animation timer.
- UI cart actions interrupt audio/listening before validation, then safely resume the consented, unmuted session. Stale request results are discarded after conversation end or component unmount.
- Some recognition engines send audio to a browser vendor service. Provider voices may also process text remotely. **Coco is local-first, not a guarantee of fully offline speech or a vendor's retention policy.** No API key or paid speech integration is configured.

References: [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis), and [Web Speech API usage](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API).

## Actual language support

| Language | Recognition locale | Ordering and replies | Greeting/TTS |
| --- | --- | --- | --- |
| English | en-US, when browser service supports it | Deterministic grammar implemented and tested | Browser voice when available |
| Punjabi | pa-IN, experimental/browser-dependent | **Not implemented**; use English text commands | Short Punjabi greeting only, if a matching voice exists |
| Hindi | hi-IN, experimental/browser-dependent | **Not implemented**; use English text commands | Short Hindi greeting only, if a matching voice exists |

The selector does not imply translation or full Punjabi/Hindi ordering. Script input without a supported parser receives an English explanation and does not mutate the cart. English command text still works with another locale selected. Ordering replies use English synthesis; they are not misrepresented as translated replies. Transcript entries carry language metadata for screen readers.

## Avatar and privacy

Idle means waiting; Listening follows actual recognition start/end; Thinking follows a pending ordering/validation request; Speaking follows actual output events. The approved photograph and ambient motion are unchanged. Manual developer preview remains available when the conversation is inactive, and is disabled while a live activity owns the state.

No realistic blinking, facial deformation or lip-sync is claimed. The future PlaybackClock/VisemeFrame/LipSyncDriver interfaces remain separate: SpeechSynthesis does not provide a reliably synchronized viseme stream or reusable audio clock here. A real rig/audio pipeline is still needed.

Original portraits stay under ignored root `private-assets/`. The image route remains development/loopback-only, refuses production reads and avoids image optimization caches. Browser artifacts stay in ignored `private-assets/test-results`; do not publish screenshots containing the original photo. No photo is sent to the ordering backend or speech service.

## Backend endpoints

All paths below are prefixed by `/api/v1/restaurants/{restaurant_id}`; the configured ID is `round-table`.

| Method and suffix | Purpose |
| --- | --- |
| GET (empty suffix) | Restaurant configuration and missing-data checklist |
| GET /menu | Structured catalog with provenance |
| GET /menu/categories | Categories, including empty verified-data gaps |
| GET /menu/items?q=&category= | Server-side menu search |
| GET /menu/items/{item_id} | Single catalog item |
| POST /cart/validate | Validate IDs/options and return authoritative summary |
| POST /orders/summary | Itemized order summary |
| POST /order-drafts | Review or confirm a demo draft |
| POST /assistant/turn | Deterministic ordering turn with cart/context |

`/health`, assistant status and the legacy demo endpoints remain. CORS now allows local GET and POST. Inputs use Pydantic with extra-field rejection for ordering DTOs. Restaurant/cart ID binding is checked. Schemas and repository ports are ready for future catalog/draft storage, but this local prototype has no authentication or production tenant-authorization system.

## Run locally — Windows PowerShell

No new packages were added for Sprint 3. Use the existing Node 24/Python 3.14 environment. For a new clone, follow README dependency setup first. If your normal servers are already running without reload, restart them to pick up the new routes/catalog.

Terminal 1:

```powershell
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI\backend'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Terminal 2:

```powershell
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI\frontend'
npm run dev -- --hostname 127.0.0.1
```

Open http://127.0.0.1:3000. API documentation: http://127.0.0.1:8000/docs. No paid API credentials are needed. NEXT_PUBLIC_API_BASE_URL and CORS_ORIGINS retain their existing defaults.

## How to test

1. Search for garlic, browse categories and inspect the source links. Deals should show no verified local offers.
2. Open Create Your Own, choose Large, select Mushrooms, choose quantity 2 and add to demo cart.
3. Change quantity/size, remove toppings/items and inspect the missing-price warnings. No $0 total should replace unknown prices.
4. Select Review draft, edit an item, and verify confirmation disappears until another review. Confirm the demo and check the explicit no-order/no-payment message.
5. Type and send directly; the first message starts a session automatically. The text box stays editable before starting, after ending, during processing and while disconnected. Sending requires a backend connection and waits for the current request to finish. Test the text sequence above with speech off first.
6. Choose Start Conversation and grant browser permission. Speak several requests with pauses; confirm automatic resume after browser ends and Coco's replies. Test Stop listening, mute/resume, denied permission, Stop speaking, speech off, End Conversation, Goodbye and interruption. Hardware capture, audible output, echo isolation and voice quality require this manual check. Also test Hey Coco / Give me a minute / Okay I'm ready / a large pizza / King Arthur's Supreme / That's everything / yes.
7. Try Punjabi/Hindi locales and notice the stated limits. Use English text as fallback.
8. Check mobile width, keyboard navigation and OS reduced-motion settings.

Automated checks:

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

Playwright uses installed Edge on Windows and its own frontend/backend on 3210/8010. `.next-test/` isolates its build from your running dev server and is ignored by Git/lint/type validation. Next's generated route-type include entries are retained so tests do not repeatedly edit tsconfig. Browser speech tests use explicit test doubles and do not record microphone audio or contact speech vendors. Backend pricing tests use synthetic, labeled prices, never actual imported prices. Existing portrait/privacy tests remain.

## Known limits and Sprint 4 recommendations

- Collect a real location-specific menu export and verify the missing prices, tax, availability and customization rules before any commercial use.
- Review manual mic/playback behavior on your target browsers/devices. Speech availability and quality cannot be guaranteed by feature detection or mocked tests.
- Expand the bounded grammar deliberately with clarification tests, or add an optional local model behind the provider interface. Do not call the current engine an LLM.
- Add real Punjabi/Hindi parsing, reviewed translations and tested voices before enabling multilingual ordering claims.
- Add persistence, authenticated tenant boundaries, menu-version conflict handling and approved POS/payment adapters before considering real submissions. No deployment/POS work is part of this sprint.
- For a genuinely speaking digital human, obtain a licensed identity-matched facial rig and synchronize verified visemes against real audio playback. Whole-image motion is not lip-sync.
- The existing ESLint 9 compatibility/deprecation and development dependency advisories from Sprint 2 are unchanged; no dependency upgrade was attempted here.

## Verification and review

Work started from clean `main` at `d75cbf2`. All Sprint 3 changes remain uncommitted. No push, deployment, original-photo publication or real restaurant submission was performed.

Final verification on 2026-11-03:

- Frontend ESLint: passed.
- TypeScript (`npm run typecheck`): passed.
- Production build (`npm run build`): passed.
- Frontend unit tests: 47 passed across 4 files after adding resilient voice-session regression coverage.
- Playwright browser tests: 17 passed, including the exact customer ASR transcript, retained Large size, session restart/mute/end, greeting/wait/ready/pizza flow, category/availability fixtures, pending-choice confirmation guards, direct text sending, offline drafting, avatar/privacy/reduced-motion checks, mobile overflow, customization, speech events and text fallback.
- Backend pytest: 117 passed, including name/greeting context, partial verified pizza selection, multiple Supreme candidates, size retention/availability, natural completion, cancel/goodbye safety and strict unknown-request regressions.
- Backend import and ASGI startup: passed; the browser suite started the API and exercised its endpoints.
- Python dependency consistency (`pip check`): passed.
- Git whitespace check: passed. The original portrait and test artifacts are ignored; no private-assets files are tracked.
- Desktop/mobile screenshots inspected. Actual Edge microphone denial and local Zira speech start/stop events passed in the running app. Successful recognition coverage uses controlled browser API events; physical microphone capture, audible playback and voice quality still require the manual checks above.

Changed-file inventory:

- New backend: `backend/data/round-table.json`, `backend/app/ordering_schemas.py`, `catalog.py`, `cart_service.py`, `ordering_engine.py`, `ordering_routes.py`, and `backend/tests/test_ordering.py`.
- Updated backend: `backend/app/main.py`, `schemas.py`, `contracts.py`, and `backend/tests/test_api.py`.
- New frontend: `frontend/src/components/menu-browser.tsx`, `order-cart.tsx`, `frontend/src/features/ordering/browser-voice.ts`, `browser-voice.test.ts`, `use-browser-voice.ts`, `use-order-session.ts`, `languages.ts`, and `frontend/tests/ordering.spec.ts`.
- Updated frontend: dashboard/avatar components, shared feature contracts and API client, global styles, layout metadata, existing avatar browser tests, Next/Playwright/ESLint/TypeScript configuration.
- Documentation/configuration: `README.md`, `docs/architecture.md`, this guide, and root `.gitignore`.

See docs/sprint-3-audit.md for the original audit snapshot, and docs/sprint-3-voice-conversation-fixes.md for the subsequent session/greeting fixes and current test evidence. Automated checks pass; final Sprint 3 sign-off remains pending manual session, greeting and hardware checks. Real restaurant operation remains blocked on verified location data and future persistence/POS/payment work. Suggested commit message after approval: `feat: add deterministic voice ordering and sourced Round Table catalog`.

Latest customer transcript fixes and actual one-large-pizza cart evidence are documented in docs/sprint-3-customer-speech-fixes.md. This adds no claim of completed manual speech verification.
