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

## Architecture

The entire application is a single-page canvas game. Next.js is used only as a build/export shell — there is no routing beyond the root page.

### Game loop

`app/page.tsx` lazy-loads `components/Game/Game.tsx` (client-only via `dynamic(..., { ssr: false })`).

`Game.tsx` owns the React lifecycle:
- A `requestAnimationFrame` loop calls `stepGame()` then `render()` every frame.
- Game state is held in a `useRef` (not `useState`) to avoid React re-renders during the loop; only phase/lives/coins are mirrored into React state to drive overlay UI.
- Keyboard input is accumulated in a `Set<string>` ref and consumed each frame.

### State management

`gameLogic.ts` → `stepGame(state, keys, W, H): GameState` — pure function, returns a new state object each frame (shallow clone via `deepClone`). Contains all physics, collision, enemy AI, coin collection, wave spawning, camera, and death logic.

`renderer.ts` → `render(ctx, state, W, H)` — pure side-effecting function. Creates two off-screen canvases per frame: one for the full scene, one for the darkness mask. The mask uses `destination-out` composite to punch the vision hole and to partially reveal sound wave rings through the darkness.

### Vision mechanic

The core visual conceit: a radial gradient on the dark overlay canvas erases a ~110px circle around the player. Sound wave rings (`SoundWave[]` in state) additionally punch through the darkness proportionally to their `alpha`, revealing entities beyond the vision radius when waves reach them.

### Level data

`levels.ts` exports `LEVELS: LevelData[]` — a static array of 3 levels. Each level defines `platforms`, `enemies`, `coins`, `exit`, `playerStart`, `worldWidth`, and `worldHeight`. Adding a level means appending to this array; no other file needs changing.

### Media

The `media/` folder is for raw assets (audio, images). Assets intended for use in the game must be copied to `public/` and referenced via `/gaming/<path>` (matching `assetPrefix`).
