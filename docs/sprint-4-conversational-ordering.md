# Sprint 4: conversational demo ordering

Coco still uses the existing loopback Qwen3 / llama.cpp model and verified Round Table reference catalog. FastAPI owns cart validation and review. The model proposes single structured actions for flexible phrasing; it never supplies a price, total, inventory result, or real order. This sprint adds no service, cloud fallback, payment, or lip-sync.

## Changes

- Independent, fully specified named-item additions can be processed together (up to three). If any clause is invalid or incomplete, none is applied. Mixed edits, multiple modifiers and unsupported combinations may still need to be separated.
- Explicit ordinal edits resolve against the current cart. "Second pizza" counts pizza lines; "second one" counts all cart lines. An ambiguous size change without a focused line retains the size and asks which item. The model cannot pick an unsupported or contradictory target.
- A pending choice can be revised without dropping the existing cart. A repeated identical conversational selection asks before adding a duplicate. An explicit "another" or an affirmative response to that specific prompt can add another.
- Routine answers avoid inference when the verified engine already has enough information. Generated proposals use a smaller context without cart-line UUIDs. Turn responses expose inference time and a reason code for fallback; no customer recordings or telemetry service are used.
- Interrupt Coco cancels active speech, drops the outstanding browser turn, and lets an already-consented microphone resume safely. Sending a newer typed request supersedes an outstanding one. Neither operation gives the old response permission to update the cart, transcript answer, or avatar.
- Explicit low-confidence browser recognition for an order-like utterance is held for correction. "Edit heard text" copies it to the composer; submitting is still explicit. Missing/zero confidence is not a reliable warning signal. The speaking state follows synthesis callbacks, cancellation, and a playback watchdog.

## Start and manually verify

Run each block in PowerShell. If the optional model/runtime has not been installed yet, follow [local model setup](local-conversational-ai.md) first.

```powershell
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI'
.\scripts\Start-LocalModel.ps1
```

```powershell
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI\backend'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

```powershell
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI\frontend'
npm run dev -- --hostname 127.0.0.1
```

1. Open <http://127.0.0.1:3000>. Verify the model status and type "Could you give me a second?" Coco should acknowledge the pause without touching the cart.
2. Send "medium King Arthur Supreme and small create your own with mushrooms." Expect two lines. Send "Could we go with the large instead?" Expect only the focused Create Your Own size to change. Send "Make the first pizza large" and verify the first line changes.
3. Send "That's everything", then "No". No demo draft may be confirmed. Send "Make the second one medium", "That's all", then "Yes". Expect one Large King Arthur's Supreme and one Medium Create Your Own with mushrooms. Total must remain unknown. Confirmation is demo-only.
4. Clear the cart, add a pizza, then repeat the exact utterance. Verify no duplicate is added until you answer the specific duplicate prompt. Try a compound request with an unlisted option and verify the entire cart stays unchanged.
5. In a supported browser, enable spoken responses, explicitly start the conversation, and grant microphone permission. Interrupt a spoken reply. Check that the avatar immediately leaves Speaking, and that microphone listening resumes only after native audio stops. Speak the next request after Listening returns. Repeat with the microphone muted and confirm it remains muted. Deny microphone permission in a fresh test session and verify typing still works.
6. While Coco is Thinking, send a replacement typed request or click Interrupt Coco. The earlier reply must not apply a cart change or begin playback. Try a noisy recognition sample; if Coco holds it for review, use Edit heard text and correct it before manually sending.
7. To inspect browser playback-start timing in DevTools after a spoken turn, run `performance.getEntriesByName("coco:turn-to-speech-start").map(({duration}) => Math.round(duration))`. These milliseconds run from typed submission / final recognition to the browser's speech-start event. They do not include the customer's speaking time or measure acoustic output. Timing is kept only in the page's performance timeline.

## Real-model measurement

From the root, run `.\backend\.venv\Scripts\python.exe -B scripts/evaluate_sprint4.py`. It starts the existing Qwen3-1.7B Q4_K_M model on an isolated loopback port (18081), invokes the actual FastAPI turn route through TestClient, and stops its own model process. Model files must already be installed. No test talks to a live restaurant.

Across two successful scripted runs, cold process readiness took **6.61-8.45 s**. The first cold inference fell back after **6.69-8.25 s** end to end (one rejected proposal, one timeout). The warm size correction took **3.63-4.41 s** for the route and used real model inference. In each run, eight turns skipped inference and took **0.007-0.119 s** each. Fallback was **one of two inference attempts** in each run, or one of ten turns overall. These are small local samples, not sustained latency or accuracy statistics.

The final cart was one Large King Arthur's Supreme and one Medium Create Your Own with mushrooms. The review was rejected and revised before final demo confirmation. No prices, payment or submission were produced. Physical microphone accuracy, listening recovery in a real room, and audible time to first speech still require a device check. Browser automation simulates recognition and synthesis events.

An interrupted request cannot update the client after it is superseded. A synchronous local generation that already started may continue until it returns or times out; a new model-dependent request may use the verified fallback while it is busy. Browser speech may use vendor processing and does not guarantee support for all accents, consistent voices, or offline recognition. There is no hands-free barge-in, new production menu, or real restaurant integration.

## Verification environment

Next.js 16.4.3 blocked the initial production build and browser startup with an advisory. The runtime and its matching native packages were patched to 16.4.6; eslint config and other dependency versions stayed pinned. The production dependency audit then reported zero vulnerabilities. See the [official security release notes](https://github.com/vercel/next.js/releases/tag/v16.4.5).

## Files changed

- Backend: `backend/app/contextual_ordering.py`, `action_executor.py`, `conversation_service.py`, `local_model.py`, `ordering_engine.py`, `ordering_schemas.py` (all in `backend/app/`); `backend/tests/test_sprint4_conversation.py`.
- Frontend: `frontend/src/components/assistant-dashboard.tsx`, `order-cart.tsx`; `frontend/src/features/ordering/browser-voice.ts`, `use-order-session.ts`, `browser-session.test.ts`; `frontend/src/lib/api.ts`; `frontend/tests/interruption.spec.ts`, `ordering.spec.ts`.
- Runtime dependency: `frontend/package.json`, `frontend/package-lock.json`.
- Documentation and evaluation: `README.md`, `docs/sprint-4-conversational-ordering.md`, `scripts/evaluate_sprint4.py`.

Final checks: 188 backend tests, 49 frontend unit tests, and 21 Edge Playwright tests passed. ESLint, TypeScript, production build, and git diff --check passed. No commits or pushes were made.
