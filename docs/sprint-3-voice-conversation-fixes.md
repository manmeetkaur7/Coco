# Sprint 3 — Resilient voice sessions and conversation intents

Later real-customer transcript refinements and the latest combined test results are recorded in [customer speech fixes](sprint-3-customer-speech-fixes.md). The original voice-session policy below remains unchanged.

**Status: implementation checks available below; manual verification of the conversation session and greetings is still required. Sprint 3 is not declared complete or ready to commit.** No commits, pushes, paid services, audio storage, menu-price changes, portrait publication or other-repository changes are part of this work.

## What changed

The previous adapter intentionally listened once per button press. It has been replaced by a logical voice session that survives normal browser end events. Start Conversation explicitly enables microphone use, with a browser greeting when speech is enabled. A text-only conversation does not grant microphone consent; its Start Conversation button remains available to opt into voice later.

The backend now runs a separate exact conversation-intent layer before strict menu parsing. Calling Coco by name, greeting her, waiting, resuming and asking for help no longer fall through to invalid-menu responses. Cart validation and unknown-price handling remain authoritative. No LLM or background wake-word detector was introduced.

## Voice lifecycle and safety policy

- Nothing listens on page load. Only Start Conversation, Resume microphone or an explicit unmute can enable recognition. Browser permission remains required.
- The logical session stays active until End Conversation or a recognized Goodbye/end-conversation intent. Stop mic and Mute microphone pause capture while preserving the session and cart. They never automatically unmute after speech or a later response. A typed I'm ready does not override manual mute.
- Each underlying browser recognizer uses `continuous=false` and interim results. After a normal end, one timer starts the next instance after **600 ms**. Repeated end events cannot schedule duplicate loops. The previous instance must report native end before another one can occupy the microphone slot.
- One final utterance creates one backend turn. Recognition is retired while processing. Final/interim callbacks from old instances are ignored. Text/cart actions use the same processing gate and cancel prior playback.
- Coco's speech is queued only after the recognizer acknowledges end. Recognition remains blocked before synthesis starts, while it plays, and until **600 ms after it ends/stops**. Native `speechSynthesis.speaking` and `pending` flags are checked too, so delayed cancellation cannot reopen the mic over queued audio. Stop speaking resumes only a previously consented, unmuted session.
- Recoverable `network`, `no-speech` and unexpected `aborted` errors permit **three automatic retries at 0.5, 1 and 2 seconds**, then pause the microphone with a visible explanation and explicit Resume microphone control. A successful final result or explicit resume resets this budget; merely starting a recognizer does not.
- Permission denial, service denial, missing audio device, unsupported language, unknown fatal errors, constructor failure and start failure do **not** automatically retry. Four consecutive immediate normal ends (under one second each) also pause instead of spinning. A normal longer browser pause can resume without that immediate-end counter.
- Guards pause capture if start is not acknowledged within **8 seconds**, microphone release is not acknowledged within **2 seconds**, or queued synthesis does not start within **10 seconds**. An unreleased recognizer is never replaced by another live instance; the UI asks for a page reload. Native playback that still reports busy is checked at 500 ms intervals, with a ten-check limit before pausing.
- Disconnection holds recognition. Reconnection resumes only if microphone consent remains enabled; it does not undo a manual mute or a fatal/error-budget pause. A failed voice turn pauses capture for explicit recovery rather than repeatedly submitting requests.
- Unmount/End cancels synthesis, restart timers and pending recognition callbacks. Late request/utterance completions cannot restart an ended session. No MediaRecorder, audio files or localStorage transcript persistence is used.

The UI explicitly shows Listening, Thinking, Speaking, Paused and Ended. The portrait keeps its existing four visual states; paused/ended map to idle, with the session state shown separately. There is no claim of animated lips, facial rigging or continuous physical recording.

## Conversation intents

| Input examples | Behavior |
| --- | --- |
| Coco; Hey Coco; Hi; Hello | Friendly Round Table welcome; no cart/context mutation. Coco is recognized only while microphone consent is already active, or as typed text. |
| How are you? | Friendly acknowledgment and offer to help order. |
| Thank you | Friendly acknowledgment; cart and pending choice retained. |
| Give me a minute; Wait | Take your time response. Pending size/item choices remain intact. The logical session stays active and listening resumes after the response. Use physical mute/stop when you want the microphone off. |
| I'm ready; Okay, I'm ready | Asks what the customer would like; preserves any pending pizza choice and size. Does not unmute a manually paused mic. |
| What do you recommend? | Names only specialty entries present in the current catalog and not marked unavailable; makes no stock/popularity/price claims. No item is added. |
| What can you do? | Explains supported menu/cart/demo functions and limitations. |
| That's all; That's everything | Reads back a complete cart and asks Is this correct? Waits for yes; never silently confirms. |
| Cancel | Clarifies clear cart versus end conversation. Does not remove items, but disarms an existing review token so an unrelated yes cannot confirm it. |
| Goodbye; End conversation | Backend returns typed `session_action=end`; frontend ends microphone consent before an optional spoken farewell. Keeps the tab-local cart, clears pending/review context and submits nothing. |

The intent layer deliberately matches bounded phrases. For example, Coco add a unicorn pizza is not classified as a greeting and cannot mutate the cart. Unknown sentences ask for clarification; unsupported toppings, brands, prices and compound orders remain rejected. Punjabi/Hindi remain experimental speech locales with an English ordering parser.

## Example to test

1. Start Conversation and grant permission; say Hey Coco.
2. Say Give me a minute, pause, then Okay, I'm ready.
3. Say I want a large pizza. Coco should ask which pizza.
4. Say King Arthur's Supreme. Exactly one large King Arthur pizza should enter the draft.
5. Say That's everything. Coco should read back the item and ask Is this correct?
6. Say yes. Only a demo draft is confirmed; prices remain unverified and no restaurant order/payment occurs.
7. Say Goodbye. Microphone capture and automatic resume must stop. The draft remains in the tab.

Greeting, waiting and ready turns can also be inserted between steps 3 and 4: they must not erase the pending large size.

## Tests and browser limitations

Regression suites cover explicit consent/no page-load capture, normal-end restart, wait/resume, one recognizer during retirement, retry limits, no fatal-error restart, no restart after mute/End/unmount, backend-processing holds, queued/playing synthesis isolation, stale callbacks, microphone/speech-start watchdogs, greeting phrases, recommendations, unknown text, cancel safety, multi-turn pizza selection and readback/yes demo confirmation. Browser tests simulate recognition/synthesis lifecycle events; those simulations do not establish physical microphone accuracy or acoustic echo isolation.

SpeechRecognition support, permission behavior and automatic restart restrictions differ by browser. Mobile browsers, background tabs, OS sleep and vendor cloud services can interrupt sessions. Recognition may send audio to the browser vendor, and provider TTS voices may process text remotely. Coco stores no recordings, but cannot guarantee a vendor's retention policy or fully offline recognition. A long no-speech period can exhaust the bounded retry budget and pause the mic; the session remains active and the UI explains how to resume.

Run the existing servers, then open http://127.0.0.1:3000:

```powershell
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI\backend'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

In a second terminal:

```powershell
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI\frontend'
npm run dev -- --hostname 127.0.0.1
```

Manual checks still required:

- Speak the exact example above with real pauses. Confirm the microphone resumes automatically after native browser ends and after each audible Coco reply.
- Leave a longer silence and verify the bounded retry/Paused explanation; explicitly resume. Check the customer's voice is not cut into duplicate orders.
- Listen to Coco through speakers and verify her own replies never appear as customer text. Repeat with headphones to distinguish room echo from lifecycle failures.
- Test Stop mic, mute/unmute, Stop speaking, speech off, End, Goodbye and navigation/unmount. No ended/muted session may resume without new consent.
- Deny/revoke permission, disconnect the speech service, switch locale and test the intended mobile browser. Text fallback must remain usable.
- Verify a pending large pizza survives Coco / Wait / I'm ready before choosing King Arthur's Supreme.

Final automated verification on 2026-11-03:

| Check | Result |
| --- | --- |
| Frontend lint | PASS |
| TypeScript (`npm run typecheck`) | PASS |
| Production build (`npm run build`) | PASS |
| Frontend unit tests | 47 passed across 4 files |
| Backend pytest | 77 passed |
| Browser tests | 16 passed |
| Portrait Git exclusion | PASS; private-assets remains ignored and untracked |

An additional native Edge smoke run against the running app at port 3000 passed real browser microphone denial and local Microsoft Zira synthesis start/stop, with zero console errors, page exceptions or failed API responses. It also rechecked the menu/cart/readback flow and mobile overflow. This still does not validate successful physical speech capture, long-pause recovery or audible/acoustic behavior; those remain manual checks.

The first browser run exposed a timing assumption in the old permission mock: it injected denial before the microphone started during the new playback cooldown. The test now waits for Listening before injecting the error. The final suite passes. Speech mocks now acknowledge native end, allowing the same single-instance safety gate used in real browsers to be tested.

Principal implementation files: backend conversation_intents.py, ordering_engine.py and ordering_schemas.py; frontend browser-voice.ts, use-browser-voice.ts, use-order-session.ts, shared API types, assistant-dashboard.tsx and session status styles. New regression coverage lives in backend/tests/test_conversation_intents.py and frontend/src/features/ordering/browser-session.test.ts, with updated voice unit and browser ordering tests. README, architecture and Sprint 3 documentation describe the revised consent/session policy. No dependencies changed.

Manual session and greeting behavior remains unverified until a customer performs the checks above. No commit or push was performed, and Sprint 3 is not declared complete.
