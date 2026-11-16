# Coco architecture

One Next.js frontend and one FastAPI backend, with an optional portable loopback-only llama.cpp inference process. No database, Docker service or paid provider is required.

Browser → typed API client → FastAPI ordering schemas → verified local JSON catalog + pure cart/ordering services. Browser speech adapters feed actual text/events into this flow. See [Sprint 3](sprint-3-voice-ordering.md).

## Boundaries

- Avatar rendering: `frontend/src/components/avatar-display.tsx` is a controlled 2D portrait renderer. `avatar-experience.tsx` owns development preview controls and private PNG loading. `features/avatar/contracts.ts` defines states, honest capabilities, viseme timing and future lip-sync ports; `features/contracts.ts` retains speech/orchestration boundaries. Whole-image drift is not facial animation. See [Sprint 2](sprint-2-avatar.md).
- Speech input/output: BrowserVoice owns an explicitly consented conversation session over browser recognition instances, with normal-end restart, bounded error backoff, native end acknowledgment, processing/playback gates, mute/stop/end and cancellable synthesis. Recognition pauses while Coco responds. No audio is retained by Coco. Browser vendor processing may require internet; manual text is always a fallback. Future timed-audio/rig ports remain separate.
- Conversation orchestration: use-order-session owns tab-local cart/context/transcript and bounded memory. FastAPI conversation_service first resolves already verified cart changes/confirmation without inference. Other English turns use local_model to propose a strict ConversationPlan. action_executor verifies requested IDs, explicit modifiers, quantities, targets and confirmation intent before calling ordering_engine. Invalid/unavailable proposals fall back to the original raw-text deterministic engine, with visible status. Source facts and action acknowledgments are rendered by the server; generated social prose passes a restrictive non-factual vocabulary/tone gate. Pending choices retain size/quantity. Raw customer text stays unchanged. Session end clears memory. See [local AI](local-conversational-ai.md).
- Menu management: catalog.py validates backend/data/round-table.json, including provenance, nullable prices and availability. CatalogRepository is a future persistence port. restaurants.py retains legacy fictional samples; they are never used by the Round Table ordering UI.
- Orders: cart_service validates IDs/customizations and calculates only known prices using Decimal. Review fingerprints guard stale-cart confirmation. Demo drafts are stateless responses with false submission/payment flags. DraftStore is a future persistence port; there is no POS/payment adapter.
- AI integrations: local_model is a bounded stdlib HTTP adapter to a literal loopback address, with constrained JSON output, timeout, single-generation lock and no proxy/cloud fallback. Model actions never supply authoritative carts, prices or review tokens. A future provider must implement the same proposal/validation boundary.
- PostgreSQL: planned persistence adapter behind repository ports. No database, driver, migrations, or connection needed today.

## Connection and failure behavior

The client checks health, assistant status, restaurant, and menu on mount, retry, and every 15 seconds. A successful batch reports connected. Any endpoint/network failure or 8-second timeout reports unavailable, with retry. Previously successful content remains visible with a stale-data warning. Requests are cancelled on unmount. Status reflects the last check, not a persistent websocket. Start/end, text, and supported browser media controls are enabled for local demo sessions. Menu mutations require successful backend validation; failed requests preserve the last validated cart.

The separate development-only avatar buttons preview visual states when a live conversation is inactive. Actual microphone, processing and audio events own avatar state during conversation. Portrait loading uses a local same-origin route, independently of backend health. No image or face data is sent to FastAPI. Production refuses photo requests before reading any file; root private-assets stays outside the frontend tracing root, with an additional private-assets trace exclusion. Images are never copied to public/ or image optimization caches.

## Configuration

`NEXT_PUBLIC_API_BASE_URL` is a public, build-time frontend URL; do not put credentials in it. Backend `CORS_ORIGINS` is a comma-separated allowlist of exact origins. Defaults allow localhost and 127.0.0.1 on port 3000. Environment files are ignored; examples are tracked. Uvicorn binds to loopback in setup commands. No authentication is implemented; this is a local development foundation.

## Dependency policy

npm lockfile pins the resolved frontend tree. Python requirements.txt pins runtime and requirements-dev.txt pins the full tested development environment. The .in files record direct dependency intent. Revalidate all checks after upgrades.

## Toolchain compatibility note

Next.js 16.4.3 ships lint plugins whose ESLint peer ranges stop at 9.x. The project therefore uses ESLint 9.39.5; npm marks this release deprecated because its upstream support window ended. ESLint 10 was rejected after peer dependency validation. Upgrade the lint toolchain together once Next.js plugins support it. Application runtime dependencies are current stable releases.

Windows npm optional WASM packages omitted their @emnapi/core/runtime dependencies during clean installation. Explicit compatible dev dependencies supply these packages; npm dependency validation then reports no problems. Native Windows bindings remain available.
