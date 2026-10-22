# Architecture / Engine Decision — The Last Night Shift

**Decision:** Keep current rendering/engine system (Build B's Three.js + React + Vite). No engine migration.

## Evidence

- **Rendering:** `src/game/engine.ts` (HospitalEngine) uses `THREE.PerspectiveCamera`, `WebGLRenderer` with `ACESFilmicToneMapping`, `FogExp2`, canvas-generated wall/floor/ceiling textures, merged static geometry per material (`mergeGeometries`), 4 pooled `PointLight`s, conditional shadows (`high` vs `low`), capped `devicePixelRatio` 1.5→1.25 on coarse pointers. Verified in `engine.ts:buildHospital()` and `batchStaticGeometry()`.
- **Game State:** `src/game/model.ts` isolated deterministic logic: `newGame()`, `resolveAction()`, `determineEnding()`, `saveGame()`/`loadGame()` with schema validation, `recordScore()`. No direct Three.js coupling. Tested via `tests/model.spec.ts`.
- **World:** `src/game/world.ts` grid `WIDTH=25 HEIGHT=31 TILE=1.7`, `GRID[]`, `DOORS` with flags, `OBJECTS` with kinds, `findPath()` BFS, `lineOfSight()` ray-march, `getLocation()`.
- **Camera:** `cameraMode: 'third'|'shoulder'|'first'` default `'third'` (`DEFAULT_SETTINGS`). `cycleCamera()` live. Fixed cinematic `fixedAnchor` + `cinematicUntil=1.45s` on room entry, disable-able via `cinematicCameras` setting. `V` key verified in `GameView.tsx`.
- **Controls:** `WASD` + Mouse look (pointer lock) + Arrow keys fallback + Touch joystick + `E/F/B/Q/H/C/V/I/J/M/Tab/Esc/R`. All verified in `GameView.tsx:keyDown`.

## Cost/Benefit Analysis

| Option | Cost | Benefit | Risk |
|--------|------|---------|------|
| **Keep (chosen)** | 0 – already builds, tests pass | Preserves validated 8-mission loop, save format, tests, performance presets | Low – known font 404 fallback only |
| **Refactor sub-systems only** | Low – extract audio/i18n already separate, could split HUD further | Clearer interfaces, testable rules | Low – defer until needed |
| **Migrate to Build A engine** | High – different grid (36×26 vs 25×31), different door math, postFX `EffectComposer`+`UnrealBloomPass`+`ShaderPass`+`RoomEnvironment` + 2k shadow maps | Bloom + film grain + parallax detail | High – would break all 15 tests, increase GPU cost, require re-tuning enemy speeds, no tests to catch regressions |

## Verification

- `npm run build` → `dist/index.html 931.99kB gzip 259.7kB` ✓
- `npx tsc --noEmit` → 0 errors ✓
- `npx playwright test tests/model.spec.ts` → 8 passed ✓
- `npx playwright test tests/browser.spec.ts` covers third-person, collision, prompt, doc, puzzle, enemy, save, continue, ending, language, avatar, camera, sanity, mobile – not yet run in this environment due to SwiftShader cost, but previous CI `test-results/.last-run.json` indicated pass via manual verification on reference build. Mark as NOT VERIFIED in this sandbox until remote CI.

## Next Steps

1. Polish pass: fix `src/index.css` font-face paths (add `public/fonts/` or switch to Google Fonts import), add subtle flicker/shadow composition without hiding interactables.
2. Keep architecture: add components only where interfaces are clear (e.g., separate `Audio`/`I18n` already done).
3. Any future migration requires minimal proof-of-concept + measured blocker list + asset conversion cost.

