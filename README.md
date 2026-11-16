# Coco

A digital human restaurant assistant, designed around thoughtful hospitality. The long-term vision is natural voice conversations, synchronized speech and facial expression, menu understanding, and restaurant ordering.

**Coco combines a real local language model with verified English demo ordering.** A loopback-only llama.cpp/Qwen model proposes structured conversation actions; the existing ordering engine validates every cart change. Clear ordering and confirmation use a fast path without inference. The dashboard labels unavailable models and rejected proposals honestly. No paid API, real restaurant submission or payment processing is implemented. Local prices, tax, availability and promotions are unverified and stay nullable. Browser speech is optional and may use vendor services; manual text works without microphone access. Punjabi/Hindi are experimental speech locales, not full ordering languages. [Local AI setup, safety and limitations](docs/local-conversational-ai.md). [Sprint 3 menu sources](docs/sprint-3-voice-ordering.md).

The approved portrait is kept in ignored private-assets/ and is served only in local development. Whole-image motion is not facial animation, blinking or lip-sync. [Portrait privacy details](docs/sprint-2-avatar.md).

## Structure and stack

- `frontend/`: Next.js App Router, React, TypeScript, Tailwind CSS; responsive plum, rose, and champagne dashboard.
- `backend/`: FastAPI, Pydantic response schemas, Uvicorn, pytest and HTTPX2 tests.
- `docs/architecture.md`: ownership boundaries, future integration ports, configuration and failure behavior.
- `.env.example`: overview of configuration. Each app reads only the documented settings.

See frontend/package.json and backend/requirements*.txt for exact tested dependencies. Node 24 LTS and Python 3.14 were used locally. npm's lockfile and pinned Python requirements make installation repeatable.

## Windows PowerShell setup

Open backend and frontend terminals. For flexible local AI, also start the model service below. No virtual environment activation is required.

Local model (one-time setup downloads free model weights and the portable CPU runtime inside ignored private-assets):

```powershell
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI'
.\scripts\Setup-LocalModel.ps1
.\scripts\Start-LocalModel.ps1
# Stop only the Coco-owned model process when finished:
# .\scripts\Stop-LocalModel.ps1
```

Backend terminal:

```powershell
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI\backend'
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Frontend terminal:

```powershell
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI\frontend'
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open http://127.0.0.1:3000. API documentation: http://127.0.0.1:8000/docs. Stop servers with Ctrl+C. For subsequent runs, only the Set-Location and startup commands are necessary.

The API defaults to http://127.0.0.1:8000. Change `frontend/.env.local` before starting/building the frontend if needed. To change backend allowed origins, set `$env:CORS_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000'` in its terminal before startup. FastAPI reads the shell environment; it does not automatically load the root .env file.

## Current features

- Approved portrait and responsive design, live transcript, consent-based start/end voice sessions, safe microphone restart after browser pauses, mute/stop controls and browser text-to-speech.
- Twelve official-source Round Table catalog entries, server-side search, categories, size/topping choices, quantities and an editable demo cart.
- Authoritative nullable pricing, missing-data warnings, readback and stale-cart-safe demo confirmation. No real orders or payments.
- Development-only avatar state controls, motion toggle, private PNG loading, and missing/error fallbacks. Original photos stay in ignored root `private-assets/` and are never served in production.
- Live API connection checks every 15 seconds, loading state, timeout, error notice and retry.
- Restaurant/catalog data fetched from FastAPI; prices are unverified rather than guessed. Legacy fictional demo endpoints remain for compatibility.
- Typed API client, response schemas and isolated future integration contracts.
- Actual local inference, bounded session history/preferences, grounded recommendations, professional social responses, validated corrections and a deterministic fallback. Session memory clears on End Conversation and is not persisted.
- Local CORS allowlist and OpenAPI docs.

| Route | Purpose |
| --- | --- |
| GET /health | API process health |
| GET /api/v1/assistant/status | Honest model/browser capability status |
| GET /api/v1/assistant/model | Loopback model health and fallback status |
| GET /api/v1/restaurants/round-table | Restaurant configuration and missing-data checklist |
| GET /api/v1/restaurants/round-table/menu | Official-source catalog with nullable prices |
| GET /api/v1/restaurants/round-table/menu/items?q= | Catalog search |
| POST /api/v1/restaurants/round-table/cart/validate | Authoritative cart validation and pricing |
| POST /api/v1/restaurants/round-table/order-drafts | Readback and demo-only confirmation |
| POST /api/v1/restaurants/round-table/assistant/turn | Local-model proposal plus verified ordering, or labeled fallback |
| GET /api/v1/restaurants/demo | Fictional sample restaurant |
| GET /api/v1/restaurants/demo/menu | Fictional sample menu, USD |

## Verification

Frontend:

```powershell
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI\frontend'
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
# Optional: serve the production build locally
npm run start -- --hostname 127.0.0.1
```

Backend:

```powershell
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI\backend'
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -c "from app.main import app; print(app.title)"
# After starting uvicorn:
Invoke-RestMethod http://127.0.0.1:8000/health
```

For an integration check, start both servers and follow the ordering examples in docs/sprint-3-voice-ordering.md. Microphone access requires an explicit Start Conversation or Resume microphone action; it never starts on page load or from typed messages alone. Browser tests use their own ports and an isolated .next-test folder, without replacing your running dev server. Test microphone capture and audible speech manually on your device. Greeting intents and resilient session policy are documented in docs/sprint-3-voice-conversation-fixes.md; Sprint 3 remains pending manual session and greeting verification.

The implementation audit, test evidence, fixes, remaining manual checks and complete Git inventory are recorded in docs/sprint-3-audit.md. Physical microphone recognition and audible playback still require manual sign-off.

The latest real-customer speech regressions (Coco/Koko/Cocoa, active-session Hey Google, pending Supreme selection, retained Large size and natural order completion) are documented in docs/sprint-3-customer-speech-fixes.md. Greetings never rewrite the displayed customer transcript, and partial names require a safe choice before adding an item.

## Planned features — require later sprint approval

Rigged facial animation/lip-sync, full Punjabi/Hindi ordering, verified local menu/pricing, persistent storage, richer local model evaluation, authenticated tenancy and approved POS/payment adapters remain future work. Current browser speech does not provide synchronized facial visemes.

## Git

Sprints 1 through 3 are tracked in the existing repository. Sprint 4 changes are for local review. No commits, pushes, repository creation, or deployments are performed automatically. Never force-add private-assets or move the original photo to public/.

Toolchain limitation: Next.js lint plugins currently require ESLint 9, whose upstream package is marked deprecated. The latest compatible 9.x is pinned through package-lock.json. See docs/architecture.md for details.

[Sprint 4 conversation, interruption and manual verification](docs/sprint-4-conversational-ordering.md).
