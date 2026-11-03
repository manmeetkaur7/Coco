# Coco

A digital human restaurant assistant, designed around thoughtful hospitality. The long-term vision is natural voice conversations, synchronized speech and facial expression, menu understanding, and restaurant ordering.

**Sprint 2 adds a local portrait avatar foundation.** Coco supports idle, listening, thinking, and speaking visual previews, gentle whole-image motion, and an optional private reference PNG. The user-provided reference image is stored locally in ignored private-assets/ and can be displayed in development. Facial animation, blinking, lip-sync, voice, AI conversations, orders, and PostgreSQL are not implemented. Maison Olive and every menu item are clearly labeled fictional sample data. No paid avatar service or AI key is required. See [Sprint 2 avatar setup and limitations](docs/sprint-2-avatar.md).

## Structure and stack

- `frontend/`: Next.js App Router, React, TypeScript, Tailwind CSS; responsive plum, rose, and champagne dashboard.
- `backend/`: FastAPI, Pydantic response schemas, Uvicorn, pytest and HTTPX2 tests.
- `docs/architecture.md`: ownership boundaries, future integration ports, configuration and failure behavior.
- `.env.example`: overview of configuration. Each app reads only the documented settings.

See frontend/package.json and backend/requirements*.txt for exact tested dependencies. Node 24 LTS and Python 3.14 were used locally. npm's lockfile and pinned Python requirements make installation repeatable.

## Windows PowerShell setup

Open two terminals. No virtual environment activation is required, avoiding PowerShell execution-policy changes.

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
Copy-Item .env.example .env.local
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open http://127.0.0.1:3000. API documentation: http://127.0.0.1:8000/docs. Stop servers with Ctrl+C. For subsequent runs, only the Set-Location and startup commands are necessary.

The API defaults to http://127.0.0.1:8000. Change `frontend/.env.local` before starting/building the frontend if needed. To change backend allowed origins, set `$env:CORS_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000'` in its terminal before startup. FastAPI reads the shell environment; it does not automatically load the root .env file.

## Current features

- Responsive branding, portrait avatar foundation, honest empty transcript, disabled microphone/start/end controls.
- Development-only avatar state controls, motion toggle, private PNG loading, and missing/error fallbacks. Original photos stay in ignored root `private-assets/` and are never served in production.
- Live API connection checks every 15 seconds, loading state, timeout, error notice and retry.
- Restaurant information and four menu previews fetched from the backend, including prices and dietary labels.
- Typed API client, response schemas and isolated future integration contracts.
- Local CORS allowlist and OpenAPI docs.

| Route | Purpose |
| --- | --- |
| GET /health | API process health |
| GET /api/v1/assistant/status | Foundation phase and unavailable future capabilities |
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

For a manual integration check, start both servers, verify sample restaurant/menu content and connected status, stop the backend and wait up to 23 seconds for the next check/timeout, then restart it and select Retry connection. Verify narrow/mobile layout and keyboard navigation. No microphone permission should be requested.

## Planned features — require later sprint approval

Rigged 3D avatar rendering, genuine blinking and expressions, streaming speech input/output, lip synchronization, conversation orchestration, provider integration, PostgreSQL menu/order persistence, validated order workflows, authentication and operational hardening. The current 2D portrait effect is not facial animation.

## Git

Sprint 1 is already tracked in the existing repository. Sprint 2 changes remain uncommitted for your review. No commits, pushes, repository creation, or deployments are performed automatically. Never force-add private-assets or move the original photo to public/.

Toolchain limitation: Next.js lint plugins currently require ESLint 9, whose upstream package is marked deprecated. The latest compatible 9.x is pinned through package-lock.json. See docs/architecture.md for details.
