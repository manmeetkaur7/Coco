# Sprint 2 — Coco portrait avatar foundation

## Scope and current result

Coco now has a reusable 2D portrait renderer and four explicit states: idle, listening, thinking, and speaking. The plum, rose, and champagne visual design, restaurant/menu requests, transcript, connection checks, retry behavior, and disabled conversation controls remain in place.

This is a portrait foundation, **not a rigged 3D human**. It cannot blink, deform facial features, produce facial expressions, move the mouth, or lip-sync. The idle effect is a gentle whole-image drift (3 px and 1.2% scale), with ambient lighting. Listening/thinking/speaking change visual indicators only. They do not capture a microphone, run AI, or play speech.

## Reference photograph — imported locally

After the initial implementation, the user supplied an image attachment in this chat. That exact PNG has now been copied without modification to ignored `private-assets/coco-reference.png`. The ChatGPT File Library itself was not accessed, and no substitute face was generated. The reference is available for local development only; it has not been committed, pushed, or copied to public/.

The project-root `private-assets/` directory is prepared and ignored by the root rule `/private-assets/`. Git does not track empty directories, so recreate it after a new clone. Test artifacts and test-only transparent pixels also stay under this ignored directory.

### Replace the image locally if needed

1. Download **your own** `Warm Professional Portrait Selfie.png` from the ChatGPT File Library to your computer.
2. Copy it to the project-root directory using this PowerShell example (adjust the source if your download has a different location):

```powershell
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI'
New-Item -ItemType Directory -Path '.\private-assets' -Force | Out-Null
Copy-Item -LiteralPath "$env:USERPROFILE\Downloads\Warm Professional Portrait Selfie.png" -Destination '.\private-assets\coco-reference.png'
git check-ignore private-assets/coco-reference.png
```

3. Run the frontend in development mode on loopback, then use **Reload portrait** in the avatar preview panel.

The source must be an actual PNG, no larger than 20 MB. Renaming a JPEG to .png does not convert it. The server checks size, PNG signature and IHDR; the browser checks decoding. A missing/invalid photo leaves the labeled placeholder and a recoverable message.

**Do not put the source in frontend/public, import it into code, force-add private-assets, or include screenshots containing the real photo in tracked docs.** Existing repository screenshots contain the old abstract placeholder only. New browser test screenshots are written to ignored private-assets/test-results instead.

### Privacy boundary

- A fixed Next.js server route `/api/avatar/reference` reads only `../private-assets/coco-reference.png`, relative to frontend/. Request parameters cannot select a different path.
- The route is available only with NODE_ENV=development and a loopback Host. Cross-site Origin and Sec-Fetch-Site requests are denied. It sends private/no-store, same-origin resource policy, no-sniff and no-index headers.
- Production returns an empty 404 **before any file read**, even when a source exists. Production UI makes no portrait request and has no preview controls. There is intentionally no public portrait in production.
- Next.js output-file tracing explicitly excludes private-assets from deployable bundles. No photo bytes are embedded into client JS or Next Image optimization caches.
- The frontend uses an in-memory blob URL and revokes it on reload/unmount. No third-party service receives the source.
- This is a local development boundary, not user authentication. Start with --hostname 127.0.0.1; do not expose the dev server through a tunnel, port forward, LAN bind, or shared proxy. Host checks are defense in depth, not authentication.
- Public portrait use later needs a separately approved derivative and delivery/privacy design. Do not publish the original to make a deployed demo work.

## Components and contracts

- `frontend/src/components/avatar-display.tsx`: controlled renderer; props are state, portraitSrc, motionEnabled, and onPortraitError. It can receive future orchestrator state without owning conversation logic.
- `frontend/src/components/avatar-experience.tsx`: local portrait loading, state preview controls, status messages, reload and motion toggle. Controls are compiled behind NODE_ENV=development.
- `frontend/src/features/avatar/use-private-portrait.ts`: local fetch, 8-second timeout, cancellation, image errors and object URL cleanup.
- `frontend/src/features/avatar/contracts.ts`: AvatarState, honest capability flags, timestamped VisemeFrame, PlaybackClock and LipSyncDriver interfaces.
- `frontend/src/features/contracts.ts`: existing speech/conversation ports preserved; AvatarRenderer accepts thinking as well as the original states. RiggedAvatarRenderer and TimedSpeechOutput are future adapter contracts only.
- `frontend/src/server/private-portrait.ts` and `app/api/avatar/reference/route.ts`: fixed-path local source access.
- Backend assistant status retains all existing keys and adds avatar_mode, avatar_state_preview_available, facial_animation_available, and lip_sync_available. avatar_available remains false because a real interactive animated human is not implemented; the new mode/preview fields describe what is available. The backend does not infer whether your local photo exists.

Capabilities: portrait display and ambient motion are supported when a valid photo is present; blinking, facial deformation, lip-sync, voice and AI remain unsupported. No paid dependencies or third-party face assets were added. New dependencies are development/testing tools only.

## Run on Windows PowerShell

Use Node 24 LTS (24.11.0 tested) and Python 3.14 with the existing virtual environment. jsdom 27.4 is used because newer releases require a newer Node patch than this workstation.

Terminal 1 — backend:

```powershell
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI\backend'
# First setup only, if .venv is missing:
# python -m venv .venv
# .\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Terminal 2 — frontend:

```powershell
Set-Location 'C:\Users\mkghu\Documents\Portfolio-Projects\Coco-AI\frontend'
# After pulling these changes on another checkout, install the lockfile:
# npm ci
# If .env.local does not exist: Copy-Item .env.example .env.local
npm run dev -- --hostname 127.0.0.1
```

Open http://127.0.0.1:3000. Keep both terminals running. API docs are at http://127.0.0.1:8000/docs. No image or AI key is needed to exercise the fallback and state preview.

## Preview avatar states

In development, scroll to **Avatar state preview** below the portrait. Use the Idle/Listening/Thinking/Speaking buttons with a mouse, Tab + Enter, or Space. The selected state uses aria-pressed and a polite live status. The speaking indicator is decorative and explicitly labeled as a no-audio preview.

Uncheck **Ambient portrait motion** to stop portrait/state effects. The OS/browser prefers-reduced-motion setting takes priority and disables animations and transitions inside the renderer; the existing background already respects this setting. The mobile preview adapts to a single column and four state buttons (two columns on very narrow screens).

## Tests

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

Vitest/Testing Library test fallback, all four states, keyboard interaction, user motion setting, failed requests/decoding, reload, blob URL cleanup and production gating. Server tests use transparent 1x1 pixels in disposable ignored test directories; they never read or replace your real photo. They verify file limits, local-origin checks, safe responses, no-store and production refusal before reading.

Playwright uses installed Microsoft Edge on Windows. On another OS, install the Playwright Chromium browser before running test:e2e. The test config starts its own local frontend on 3210 and backend on 8010 with the matching CORS origin, then stops them. It checks dashboard/menu preservation, keyboard state selection, mobile overflow, reduced motion, the motion checkbox and cross-site photo denial. Artifacts stay ignored under private-assets/test-results. It does not start your normal development ports.

For a production check, run npm run build and npm run start -- --hostname 127.0.0.1. The avatar developer panel must be absent and /api/avatar/reference must return 404. A private reference photo must never be moved to public/ to bypass this restriction.

## Next steps toward a genuinely speaking human

1. Review the imported reference in the local development preview and refine framing if desired. The source remains unchanged.
2. Create or obtain a properly licensed, identity-matched rigged asset using a local workflow. A single photo does not supply reliable 3D geometry. Additional views and manual modeling/rigging may be needed.
3. Implement a renderer adapter with actual blink, expression and mouth blendshapes. Enable each capability only after real assets and tests demonstrate it works.
4. Implement speech input and output behind the existing interfaces, with explicit microphone permission and actual audio lifecycle events. Keep provider secrets server-side.
5. Drive viseme frames against real playback time, not independent timers. Reset mouth poses on pause, interruption, end and error. Add tests for cancellation and synchronization.
6. Connect orchestration states to real speech/AI events, then expand menu-grounded conversation and ordering in a later approved sprint.

## Verification record

Verified on 2026-11-02:

- Frontend lint: passed with zero findings.
- TypeScript generation and validation: passed.
- Frontend production build: passed.
- Vitest component/storage tests: 15 passed.
- Playwright browser tests: 5 passed using installed Microsoft Edge, including real browser PNG/blob decoding with a transparent non-face test pixel.
- Backend pytest: 6 passed; pip check passed.
- Live production smoke check: preview controls absent; private portrait route returned an empty 404 with no-store.
- Build trace inspection: zero private-assets file entries.
- Git ignore verification: source path and browser artifacts are ignored; no private assets are tracked.
- Runtime npm audit (--omit=dev): zero vulnerabilities.

The five existing Sprint 1 backend tests passed before implementation. No remaining failing checks were found. All changes remain uncommitted and unpushed; verification servers were stopped. The user has since provided a reference PNG, now imported into ignored local storage.

The existing ESLint/minimatch development dependency chain now reports 16 moderate npm audit advisories; its relevant versions are unchanged from HEAD. No forced major upgrades were applied as part of avatar work. See architecture.md for the existing ESLint 9 compatibility limitation. Runtime audit is checked separately.


## Files created or modified

Modified:

- `.gitignore`
- `README.md`
- `backend/app/schemas.py`
- `backend/tests/test_api.py`
- `docs/architecture.md`
- `frontend/next.config.ts`
- `frontend/package-lock.json`
- `frontend/package.json`
- `frontend/src/app/globals.css`
- `frontend/src/components/assistant-dashboard.tsx`
- `frontend/src/components/avatar-display.tsx`
- `frontend/src/features/contracts.ts`
- `frontend/src/lib/api.ts`

Created:

- `docs/sprint-2-avatar.md`
- `frontend/playwright.config.ts`
- `frontend/src/app/api/avatar/reference/route.ts`
- `frontend/src/components/avatar-experience.test.tsx`
- `frontend/src/components/avatar-experience.tsx`
- `frontend/src/features/avatar/contracts.ts`
- `frontend/src/features/avatar/use-private-portrait.ts`
- `frontend/src/server/private-portrait.test.ts`
- `frontend/src/server/private-portrait.ts`
- `frontend/tests/avatar.spec.ts`
- `frontend/vitest.config.mts`

Local-only: root `private-assets/` and its test artifacts (ignored, never staged). The user-provided reference PNG is imported locally and remains ignored.

## Reference import verification

The attached PNG was copied unchanged to private-assets/coco-reference.png (1536 × 1024). A headless local browser confirmed successful image decoding, a local blob source, and HTTP 200 with private/no-store headers from the development route. No public image or screenshot of the reference was created. Git confirms the source is ignored and untracked.
