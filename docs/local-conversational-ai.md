# Local conversational AI

Coco uses a real local Qwen language model through the portable llama.cpp CPU server. This is a hybrid system: a model proposes structured actions, and the existing verified ordering engine remains authoritative. No paid provider, cloud LLM fallback, POS or payment integration is included.

## Run on Windows PowerShell

From the project root, once:

```powershell
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI'
.\scripts\Setup-LocalModel.ps1
```

Setup downloads the pinned runtime and official model weights, checks SHA256, then quantizes the weights locally. Allow several minutes and roughly 3 GB for the default runtime, source weights and quantized model. Everything stays under ignored `private-assets/local-model/`. Downloads need internet; inference does not. Nothing is installed system-wide. License files are retained beside the weights.

For subsequent runs, start the model, backend and frontend:

```powershell
# Model: starts a hidden loopback-only process and attempts warm-up.
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI'
.\scripts\Start-LocalModel.ps1
```

```powershell
# Backend terminal; existing virtual environment
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI\backend'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

```powershell
# Frontend terminal
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI\frontend'
npm run dev -- --hostname 127.0.0.1
```

Open <http://127.0.0.1:3000>. `GET /api/v1/assistant/model` reports actual model health. The dashboard distinguishes a connected model, disabled/unavailable model, and a rejected proposal handled by verified fallback. An inference response reports its actual `engine`; a connected model does not imply every reply required inference.

Stop the Coco-owned model with `scripts/Stop-LocalModel.ps1` from the root. It checks the executable path before stopping its recorded PID. Stop frontend/backend with Ctrl+C. Startup refuses to replace an existing `coco-local` service; stop that service first to change models.

## Model and runtime

- Default: official [Qwen3-1.7B-GGUF](https://huggingface.co/Qwen/Qwen3-1.7B-GGUF), revision `90862c4b9d2787eaed51d12237eafdfe7c5f6077`, Apache 2.0. Source Q8_0 is SHA256 `061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a`; converted locally to Q4_K_M with the pinned runtime. Requantization is a memory/quality compromise.
- Runtime: [llama.cpp b12080](https://github.com/ggml-org/llama.cpp/releases/tag/b12080), MIT, Windows CPU x64 archive SHA256 `c0a89dd2edce978ff0a7a5df88e97a735ffab08162e18329c5e964ece6ed160c`.
- Experimental smaller model: official Qwen3-0.6B Q8_0, revision `23749fefcc72300e3a2ad315e1317431b06b590a`, SHA256 `9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031`. Prepare with `Setup-LocalModel.ps1 -IncludeFast`; start with `Start-LocalModel.ps1 -Fast`. This model misclassified some natural conversation turns during testing and is **not** the default quality recommendation.

The tested laptop has 8 GB RAM and CPU inference. Clear verified additions, bounded size corrections and confirmation bypass inference; flexible model replies can still take several seconds, particularly under memory pressure. Warm-up reduces the first customer prompt cost. The prompt retrieves relevant catalog details, omits irrelevant ingredients/toppings and carries only four recent turns. Generation is capped at 140 tokens and defaults to an eight-second socket timeout; HTTP overhead and model loading can exceed that budget slightly. This is not a hard real-time guarantee. More RAM/a capable local GPU or a stronger local model can improve quality/latency; no cloud service is silently substituted.

## Configuration

FastAPI reads shell environment, not the root `.env.example` automatically:

```powershell
$env:COCO_MODEL_ENABLED = 'true'
$env:COCO_LOCAL_MODEL_URL = 'http://127.0.0.1:8081'
$env:COCO_LOCAL_MODEL_NAME = 'coco-local'
$env:COCO_MODEL_TIMEOUT_SECONDS = '8'
$env:COCO_FAST_ORDERING = 'true'
```

Only literal loopback HTTP endpoints are accepted, with no URL credentials, path, query or redirects. The adapter does not use environment HTTP proxies. Set `COCO_MODEL_ENABLED=false` and restart the backend to use only deterministic ordering. The UI labels that mode. Requests are bounded and concurrent model generations are rejected to fallback rather than queued by Coco. This is local development, not an authenticated public deployment.

## Conversation and safety boundary

1. Validate the incoming cart against the source catalog before sending context to the model.
2. Serve already resolved cart changes, protected confirmation, common greetings/wait/readiness controls and explicit session end directly through the verified engine; never wait for inference merely to repeat a known decision.
3. For other English turns, send bounded session text, selected cart/pending details, explicit preferences and relevant verified menu facts to the local model.
4. Require constrained JSON matching `ConversationPlan`, with no extra fields. The model cannot supply prices, carts, review fingerprints, discounts or payment decisions.
5. Check IDs, requested sizes/quantities/toppings, action direction, unique target and explicit review/confirmation intent. Reject actions that would omit a second customization, negate a request or guess an item.
6. Execute accepted actions through the deterministic engine. Read factual acknowledgments, ingredients, recommendations, pricing and readbacks from validated source data. Generated social text passes a deliberately restrictive non-factual vocabulary/tone gate. It may be rejected even when harmless; the visible fallback is intentional.
7. A rejected/invalid/timed-out proposal passes the **original** request to the verified engine. A valid raw request may still safely change the cart; rejecting a bad model proposal does not mean discarding the customer's legitimate request.

Unknown prices and tax stay null. Availability stays unknown unless verified. Recommendations filter source ingredients against explicit vegetarian/no-mushrooms/no-onions preferences, without dietary/allergen guarantees. Other short first-person preferences are retained as context, not treated as verified food facts. More complex requests may need clarification; this small model is not guaranteed to understand every accent, preference or correction.

The model does not hear audio. Existing browser recognition supplies the unchanged transcript; accuracy depends on browser/device/language. Punjabi/Hindi remain experimental speech locales with existing deterministic limitations, not verified multilingual LLM ordering. Existing consent, pause-during-speech, restart/backoff, mute/end, avatar states and reduced motion remain intact. Actual facial animation/lip-sync is not implemented.

## Privacy and memory

Session context travels in the existing typed request/response; there is no model chat database or persistent customer profile. At most 12 customer/assistant messages, three supported preference flags and five 120-character preference notes are retained in tab memory. The model receives at most four recent messages truncated to 140 characters. End Conversation/new session clears memory. Cart control edits preserve preferences but invalidate order review as before.

Portrait files are never included in prompts or copied to public assets. Runtime/model files and evaluation transcripts stay ignored. Runtime logging is disabled; no audio recordings are stored. Browser recognition may still use a browser-vendor cloud service. Local loopback use is required; no authentication or production photo serving is added.

## Verification and manual checks

```powershell
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI\backend'
.\.venv\Scripts\python.exe -m pytest -q
Set-Location '..\frontend'
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Unit tests inject model plans and disable inference so safety regressions are repeatable. Browser tests use isolated ports 3210/8010 and explicit model-disabled mode; a connected-status fixture is labeled as a fixture, not proof of inference. Existing microphone tests simulate browser events rather than physical audio.

For a separate **actual** model/backend check, with model and backend running:

```powershell
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI'
.\backend\.venv\Scripts\python.exe scripts/evaluate_local_model.py
```

This sends real HTTP inference for social conversation and an un-scripted size correction, carries context through the turns, then verifies readback, explicit demo-only confirmation and null pricing. Its JSON evidence is saved privately. Results vary with model/runtime/hardware; passing injected-plan tests is not a model-quality guarantee.

Manually test your actual voice/accent, interruptions, audible speech timing, delayed responses, reconnecting the model, corrections to multiple cart items and preference changes. Confirm that one-question replies make sense in context, that End clears memory and stops the mic, and that Coco never repeats her own synthesized speech. Broader natural conversation and manual voice sign-off remain necessary before declaring Sprint 3 complete.

## Implementation verification — 3 November 2026

- Backend: 181 pytest cases passed; dependency check and app import passed.
- Frontend: lint, TypeScript, production build and 47 unit tests passed.
- Browser: all 20 installed-Edge Playwright tests passed, including model status/fallback, preference retention, cart/confirmation, microphone restart/denial, mute/end and avatar state coverage. No browser runtime assertion failed.
- Actual Qwen3-1.7B HTTP evaluation passed all seven checks: patient pause, local social response, one Medium pizza added, natural correction to Large, review awaiting confirmation, demo-only confirmation and null total. Final cart: one Large King Arthur's Supreme, quantity 1; no restaurant submission/payment.
- Measured flexible turns: pause 6.33 seconds, readiness 2.10 seconds, “Could we go with the large instead?” 7.12 seconds. These are observed CPU results, not guaranteed response times.
- Separate fast-path HTTP run: add 0.148 seconds, “Actually, make that a large” 0.009 seconds, readback 0.008 seconds, demo confirmation 0.008 seconds. The size acknowledgment was subsequently made explicit and covered by a regression test.
- Physical microphone recognition, audible responses and interruption behavior still require customer-device testing. A Windows Python 3.14 Proactor connection-reset diagnostic appeared during browser test disconnects; it is recorded separately from application assertions.

No commits or pushes were performed. Existing Sprint 3 edits were preserved. Original portrait, model weights/runtime and raw evaluation evidence remain ignored.
