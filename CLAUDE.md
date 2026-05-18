# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Local dev server (http://localhost:3000/gaming)
npm run build    # Static export → ./out/ (required for GitHub Pages)
npm run lint     # ESLint
```

No test suite is configured.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml` which runs `npm ci && npm run build` and deploys `./out/` to GitHub Pages at `https://jeremycolard-aev.github.io/gaming/`.

`next.config.js` sets `output: 'export'`, `basePath: '/gaming'`, and `assetPrefix: '/gaming/'` — all three must stay in sync with the repo name. Any server-side Next.js features (API routes, SSR, middleware) are incompatible with static export.

Static assets in `public/` are served at `/gaming/<filename>` in production. Audio and media files placed in `media/` must be **copied to `public/`** before they are accessible in-game.

## Architecture

The entire application is a single-page canvas game. Next.js is used only as a build/export shell — there is no routing beyond the root page.

### Game loop

`app/page.tsx` lazy-loads `components/Game/Game.tsx` (client-only via `dynamic(..., { ssr: false })`).

`Game.tsx` owns the React lifecycle:
- A `requestAnimationFrame` loop calls `stepGame()` then `render()` every frame.
- Game state is held in a `useRef` (not `useState`) to avoid React re-renders during the loop; only phase/lives/coins are mirrored into React state to drive overlay UI.
- Keyboard input is accumulated in a `Set<string>` ref and consumed each frame.
- After each `stepGame()`, `s.audioEvents` is iterated to trigger `playSfx()` calls.

### State management

`gameLogic.ts` → `stepGame(state, keys, W, H): GameState` — pure function, returns a new state object each frame (shallow clone via `deepClone`). Contains all physics, collision, enemy AI, coin collection, wave spawning, camera, and death logic. Populates `state.audioEvents: AudioEvent[]` each frame; the array is consumed and cleared by `Game.tsx`.

`renderer.ts` → `render(ctx, state, W, H)` — pure side-effecting function. Creates two off-screen canvases per frame: one for the full scene, one for the darkness mask. The mask uses `destination-out` composite to punch the vision hole and to partially reveal sound wave rings through the darkness.

### Vision mechanic

A radial gradient on the dark overlay canvas erases a ~110px circle around the player. Sound wave rings (`SoundWave[]` in state) additionally punch through the darkness proportionally to their `alpha`, revealing entities beyond the vision radius when waves reach them.

Four vision/sound mechanics are active:
- **Wave differentiation**: each `SoundWave` has a `type` (`player` | `enemy` | `coin` | `echo` | `reflected`) that drives lineWidth, dash pattern, and darkness-punch strength independently.
- **Active echolocation** (`E` key, 4 s cooldown): emits a large cyan wave (520px, speed 4.5) that strongly punches through darkness and triggers platform reflections. Cooldown shown as a circular progress indicator bottom-left.
- **Wall reflections**: every frame, non-reflected waves (`depth === 0`) check nearby solid platforms via `closestPointOnRect()`; when the ring radius crosses the platform surface, a smaller `reflected` child wave spawns there (`depth = 1`, no further reflections, max 80 total waves).
- **Directional alerts**: enemies within 380px but outside the vision circle draw a pulsing red arc + arrowhead on the vision circle perimeter, pointing toward them. Intensity fades with distance.

### Player model & animation

The player is drawn as a stick-figure human in `renderer.ts → drawHumanPlayer()`. Key elements:
- **Head**: circle with hair cap and blindfold strip across eyes, nose dot in facing direction
- **Torso**: filled trapezoid
- **Limbs**: drawn with `drawLimb()` — two segments (upper + lower) with a slight natural bend at the joint
- **Back limbs** are drawn first (darker colour), front limbs drawn last (lighter)

`player.animFrame` increments in `gameLogic.ts` only when the player is on the ground and moving. The renderer converts `animFrame` to a `phase` (0–2π) to drive sinusoidal leg/arm swing. Jump and fall have fixed pose overrides.

### Audio

`audio.ts` manages two systems:
- **Music**: HTML5 `<audio>` element looping `/gaming/musique.mp3`, started on game start button click.
- **SFX**: Web Audio API, synthesized entirely in code (no external files). Events: `jump`, `land`, `footstep`, `coin`, `stomp`, `death`, `levelComplete`.

`AudioContext` is created on first user interaction to comply with browser autoplay policy.

### Level data

`levels.ts` exports `LEVELS: LevelData[]` — a static array of 3 levels. Each level defines `platforms`, `enemies`, `coins`, `exit`, `playerStart`, `worldWidth`, and `worldHeight`. Adding a level means appending to this array; no other file needs changing.

### Media

Raw assets live in `media/`. To use a file in-game, copy it to `public/` and reference it as `/gaming/<filename>`.
