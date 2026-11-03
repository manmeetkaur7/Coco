# Coco architecture

One Next.js frontend and one FastAPI backend. No extra services in Sprint 1.

Browser → typed API client → FastAPI response schemas → in-memory sample restaurant repository.

## Boundaries

- Avatar rendering: `frontend/src/components/avatar-display.tsx` is a controlled 2D portrait renderer. `avatar-experience.tsx` owns development preview controls and private PNG loading. `features/avatar/contracts.ts` defines states, honest capabilities, viseme timing and future lip-sync ports; `features/contracts.ts` retains speech/orchestration boundaries. Whole-image drift is not facial animation. See [Sprint 2](sprint-2-avatar.md).
- Speech input/output: separate `SpeechInput` and `SpeechOutput` ports. No browser media permissions, audio capture, playback, paid service, or SDK is active.
- Conversation orchestration: future `ConversationOrchestrator` owns sessions and transcript events. The current transcript is an empty state, never fabricated conversation.
- Menu management: backend `restaurants.py` contains explicitly fictional data; `MenuRepository` defines a future persistence boundary. UI obtains all restaurant and menu content over HTTP.
- Orders: future `OrderRepository` and validated `OrderDraft` contract. No checkout, order submission, pricing calculation, or payment behavior exists.
- AI integrations: backend-only `AIProvider` port; future credentials must remain on the server. No provider is called in Sprint 1.
- PostgreSQL: planned persistence adapter behind repository ports. No database, driver, migrations, or connection needed today.

## Connection and failure behavior

The client checks health, assistant status, restaurant, and menu on mount, retry, and every 15 seconds. A successful batch reports connected. Any endpoint/network failure or 8-second timeout reports unavailable, with retry. Previously successful content remains visible with a stale-data warning. Requests are cancelled on unmount. Status reflects the last check, not a persistent websocket. All controls are disabled because no conversation session can be created.

The separate development-only avatar buttons preview visual states without starting a session. Portrait loading uses a local same-origin route, independently of backend health. No image or face data is sent to FastAPI. Production refuses photo requests before reading any file; root private-assets stays outside the frontend tracing root, with an additional private-assets trace exclusion. Images are never copied to public/ or image optimization caches.

## Configuration

`NEXT_PUBLIC_API_BASE_URL` is a public, build-time frontend URL; do not put credentials in it. Backend `CORS_ORIGINS` is a comma-separated allowlist of exact origins. Defaults allow localhost and 127.0.0.1 on port 3000. Environment files are ignored; examples are tracked. Uvicorn binds to loopback in setup commands. No authentication is implemented; this is a local development foundation.

## Dependency policy

npm lockfile pins the resolved frontend tree. Python requirements.txt pins runtime and requirements-dev.txt pins the full tested development environment. The .in files record direct dependency intent. Revalidate all checks after upgrades.

## Toolchain compatibility note

Next.js 16.4.3 ships lint plugins whose ESLint peer ranges stop at 9.x. The project therefore uses ESLint 9.39.5; npm marks this release deprecated because its upstream support window ended. ESLint 10 was rejected after peer dependency validation. Upgrade the lint toolchain together once Next.js plugins support it. Application runtime dependencies are current stable releases.

Windows npm optional WASM packages omitted their @emnapi/core/runtime dependencies during clean installation. Explicit compatible dev dependencies supply these packages; npm dependency validation then reports no problems. Native Windows bindings remain available.
