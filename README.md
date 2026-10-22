# The Last Night Shift

A complete first-playable browser horror game built with React, TypeScript, Vite, and Three.js. The expanded **Patient Zero** edition uses third-person play by default, optional shoulder and first-person views, animated selectable avatars, cinematic room cameras, bilingual English/Mongolian UI and story documents, and an adaptive psychological-horror layer. All essential gameplay, artwork, fonts, geometry, textures, and synthesized audio are included locally.

## Run

```sh
npm install
npm run dev
```

```sh
npm run build
npm run preview
```

## The Night

Survive an eight-minute, real-time shift from midnight until 6:00 AM. Explore an interconnected hospital floor with Security, Maintenance, Ward C, Records, Isolation, and a Chapel. Read the manifest directly ahead of the starting position to clock in.

- Eight connected objectives, three primary decision points, and four deterministic endings.
- First-person movement, solid walls and furniture, sprinting, crouching, battery management, healing, and hiding lockers.
- A pursuer with dormant, patrol, sound investigation, search, chase, and return states. Watching it with a powered flashlight stops it; running and distractions produce audible, traceable noise.
- The Woman Behind You remembers routes used repeatedly, flashlight exposure, and lockers where she has seen the player hide. Her behavior becomes more informed without random unavoidable attacks.
- Third-person, over-shoulder, and first-person cameras can be switched live with `V`. Entering a major room can trigger a short fixed-camera horror composition; this can be disabled.
- Three procedural animated 3D avatars: Night Guard, Paramedic, and Investigator. Avatar choice changes body silhouette and uniform but not gameplay balance.
- Sanity decreases under pursuit and prolonged darkness, recovers in safer light or from medical supplies, and produces restrained visual/environmental uncertainty without disabling controls.
- Four live surveillance cameras, keyed routes, two numeric access puzzles, a listening clue, patient records, a witness recording, and an optional word-locked memorial safe.
- Beginner, Intermediate, and Advanced English change the writing, not the puzzle solutions. Optional language explanations, a searchable vocabulary notebook, an objective journal, an inventory, and a hospital map are included.
- Automatic mission checkpoints, periodic safe saves, manual saves, Continue, pause, instant restart, and seven local high scores.
- Master audio, brightness, look sensitivity, graphics presets, subtitles, and reduced-motion settings.
- English and Mongolian language modes. English-learning clues remain available, while Mongolian story translations and language explanations can be enabled from Settings.
- Keyboard/mouse and touch joystick, drag-to-look, and on-screen action controls.

## Controls

| Control | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look after clicking the game |
| V | Cycle third-person, shoulder, and first-person cameras |
| Arrow keys | Move forward/back and turn, including without pointer lock |
| Shift | Sprint |
| C | Toggle crouching |
| E | Interact or leave a locker |
| F | Toggle flashlight |
| B | Replace battery |
| Q | Throw a distraction |
| H | Hide in a nearby locker or leave it |
| I | Inventory and documents |
| M | Map |
| J | Vocabulary notebook |
| Tab | Mission journal |
| Escape | Pause |
| R on ending screen | Immediately start a new shift |

## Verification

```sh
npx tsc --noEmit
npx playwright install chromium
npx playwright install-deps chromium
npx playwright test
```

`tests/model.spec.ts` checks all puzzle solutions, mission ordering, all four endings, replay safety, language coverage, state migration, clocks, and gated pathfinding. `tests/browser.spec.ts` checks the real opening interaction, collisions, the complete mission UI route, local saves and Continue, enemy observation/noise/hiding behavior, bilingual UI, avatar selection, sanity, all camera modes, cinematic room transitions, menu settings, and emulated touch movement and looking. Full-route UI tests use a development-only engine handle to skip walking between rooms and advance the dawn clock. Production does not expose that handle.

## Structure

- `src/game/engine.ts`: procedural 3D environment, fixed-size physics substeps, lighting, interactions, enemy AI, audio positioning, and render lifecycle.
- `src/game/world.ts`: shared walkability grid, rooms, objects, locked routes, line of sight, and breadth-first pathfinding.
- `src/game/model.ts`: serializable state, deterministic missions and endings, settings, scores, and storage.
- `src/game/content.ts`: story, English variants, language hints, vocabulary, objectives, and endings.
- `src/game/audio.ts`: local Web Audio ambience, cues, footsteps, stereo positioning, and optional browser speech.
- `src/components/`: cinematic dialogs, game HUD, surveillance, journal, settings, and touch controls.

## Scope And Limitations

This is a compact single-floor first playable, not a photorealistic commercial production. The title artwork is original generated imagery; gameplay uses actual procedural 3D geometry. Audio is synthesized, and English voice availability varies by browser. Every spoken puzzle also has a written equivalent. Saves are browser-local and can be lost if site data is cleared. WebGL 2 is required. Performance presets, shared static geometry, pooled lights, and capped pixel ratios reduce rendering cost, but 60 fps on every physical desktop or phone is not guaranteed by browser-emulation tests.

Font licenses are included in `public/licenses/`. Barlow Condensed, Manrope, and IBM Plex Mono use the SIL Open Font License. Lucide icons use the ISC license. Third-party runtime packages retain their respective licenses in `node_modules`.