import type { GameState, Player, Platform, Enemy, SoundWave } from './types'
import { LEVELS } from './levels'

const GRAVITY = 0.55
const JUMP_FORCE = -13
const MOVE_SPEED = 4.2
const FRICTION = 0.82
const VISION_RADIUS = 110
const CAM_LERP = 0.12

export function buildInitialState(level: number, lives: number): GameState {
  const lvl = LEVELS[level]
  return {
    phase: 'playing',
    level,
    lives,
    coins: 0,
    totalCoins: lvl.coins.length,
    player: {
      x: lvl.playerStart.x,
      y: lvl.playerStart.y,
      w: 24, h: 36,
      vx: 0, vy: 0,
      onGround: false,
      facing: 1,
      dead: false,
      respawnTimer: 0,
    },
    platforms: lvl.platforms.map(p => ({ ...p })),
    enemies: lvl.enemies.map(e => ({ ...e })),
    coinItems: lvl.coins.map(c => ({ ...c })),
    exit: { ...lvl.exit },
    waves: [],
    camera: { x: lvl.playerStart.x - 400, y: 0 },
    playerWaveTimer: 0,
    deathTimer: 0,
    levelTimer: 0,
  }
}

function rectOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

function resolvePlatformCollision(p: Player, plat: Platform): void {
  const overlapX = Math.min(p.x + p.w, plat.x + plat.w) - Math.max(p.x, plat.x)
  const overlapY = Math.min(p.y + p.h, plat.y + plat.h) - Math.max(p.y, plat.y)

  if (overlapX <= 0 || overlapY <= 0) return

  if (overlapX < overlapY) {
    p.x += p.x < plat.x ? -overlapX : overlapX
    p.vx = 0
  } else {
    if (p.y < plat.y) {
      p.y = plat.y - p.h
      p.vy = 0
      p.onGround = true
    } else {
      p.y = plat.y + plat.h
      p.vy = 0
    }
  }
}

function spawnWave(
  state: GameState,
  x: number, y: number,
  color: string,
  maxRadius = 160,
  speed = 1.8,
): void {
  state.waves.push({ x, y, radius: 8, maxRadius, alpha: 0.7, color, speed })
}

export function stepGame(
  state: GameState,
  keys: Set<string>,
  canvasW: number,
  canvasH: number,
): GameState {
  if (state.phase !== 'playing') return state

  const s = deepClone(state)
  const p = s.player
  const lvl = LEVELS[s.level]

  s.levelTimer++

  // ── Player input ────────────────────────────────────────────────────────
  const left  = keys.has('ArrowLeft')  || keys.has('KeyA')
  const right = keys.has('ArrowRight') || keys.has('KeyD')
  const jump  = keys.has('ArrowUp')    || keys.has('KeyW') || keys.has('Space')

  if (left)  { p.vx -= MOVE_SPEED * 0.35; p.facing = -1 }
  if (right) { p.vx += MOVE_SPEED * 0.35; p.facing =  1 }
  if (!left && !right) p.vx *= FRICTION

  p.vx = Math.max(-MOVE_SPEED, Math.min(MOVE_SPEED, p.vx))

  if (jump && p.onGround) {
    p.vy = JUMP_FORCE
    p.onGround = false
    spawnWave(s, p.x + p.w / 2, p.y + p.h, 'rgba(200,169,110,0.5)', 80, 2.5)
  }

  // ── Physics ─────────────────────────────────────────────────────────────
  p.vy += GRAVITY
  p.vy = Math.min(p.vy, 20)
  p.x += p.vx
  p.y += p.vy

  p.x = Math.max(0, Math.min(p.x, lvl.worldWidth - p.w))

  p.onGround = false

  for (const plat of s.platforms) {
    if (!rectOverlap(p.x, p.y, p.w, p.h, plat.x, plat.y, plat.w, plat.h)) continue
    if (plat.type === 'deadly') {
      p.dead = true
      break
    }
    resolvePlatformCollision(p, plat)
  }

  // ── Fall off bottom ──────────────────────────────────────────────────────
  if (p.y > lvl.worldHeight + 100) p.dead = true

  // ── Enemy stepping and waves ─────────────────────────────────────────────
  for (const e of s.enemies) {
    if (!e.alive) continue

    e.x += e.vx
    if (e.x < e.startX || e.x > e.startX + e.patrolRange) e.vx *= -1

    e.waveTimer++
    if (e.waveTimer >= e.waveInterval) {
      e.waveTimer = 0
      spawnWave(s, e.x + e.w / 2, e.y + e.h / 2, 'rgba(200,80,80,0.65)', 180, 1.6)
    }

    // Stomp on enemy
    const stompY = p.y + p.h
    const prevY  = stompY - p.vy
    if (
      p.vy > 0 && prevY <= e.y &&
      rectOverlap(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)
    ) {
      e.alive = false
      p.vy = JUMP_FORCE * 0.6
      spawnWave(s, e.x + e.w / 2, e.y + e.h / 2, 'rgba(255,200,80,0.8)', 120, 3)
    } else if (rectOverlap(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) {
      p.dead = true
    }
  }

  // ── Coins ────────────────────────────────────────────────────────────────
  for (const c of s.coinItems) {
    if (c.collected) continue
    c.waveTimer++
    if (c.waveTimer >= 100) {
      c.waveTimer = 0
      spawnWave(s, c.x, c.y, 'rgba(80,200,128,0.5)', 80, 1.2)
    }
    const dx = p.x + p.w / 2 - c.x
    const dy = p.y + p.h / 2 - c.y
    if (Math.sqrt(dx * dx + dy * dy) < p.w / 2 + c.r) {
      c.collected = true
      s.coins++
      spawnWave(s, c.x, c.y, 'rgba(80,200,128,0.9)', 60, 3)
    }
  }

  // ── Exit ─────────────────────────────────────────────────────────────────
  const ex = s.exit
  if (rectOverlap(p.x, p.y, p.w, p.h, ex.x, ex.y, ex.w, ex.h)) {
    s.phase = s.level < LEVELS.length - 1 ? 'levelComplete' : 'victory'
  }

  // ── Player wave (footstep every ~40 frames when moving) ──────────────────
  s.playerWaveTimer++
  if (s.playerWaveTimer >= 40 && (Math.abs(p.vx) > 0.5) && p.onGround) {
    s.playerWaveTimer = 0
    spawnWave(s, p.x + p.w / 2, p.y + p.h, 'rgba(200,169,110,0.3)', 60, 1.5)
  }

  // ── Sound waves update ───────────────────────────────────────────────────
  s.waves = s.waves.filter(w => w.alpha > 0.01)
  for (const w of s.waves) {
    w.radius += w.speed
    w.alpha  *= 0.97
    if (w.radius >= w.maxRadius) w.alpha = 0
  }

  // ── Camera follows player ────────────────────────────────────────────────
  const targetCamX = p.x - canvasW / 2 + p.w / 2
  const targetCamY = p.y - canvasH / 2 + p.h / 2
  s.camera.x += (targetCamX - s.camera.x) * CAM_LERP
  s.camera.y += (targetCamY - s.camera.y) * CAM_LERP
  s.camera.x = Math.max(0, Math.min(s.camera.x, lvl.worldWidth  - canvasW))
  s.camera.y = Math.max(0, Math.min(s.camera.y, lvl.worldHeight - canvasH))

  // ── Death handling ───────────────────────────────────────────────────────
  if (p.dead) {
    s.deathTimer++
    if (s.deathTimer > 80) {
      const newLives = s.lives - 1
      if (newLives <= 0) {
        s.lives = 0
        s.phase = 'dead'
      } else {
        return buildInitialState(s.level, newLives)
      }
    }
  }

  return s
}

// Minimal deep clone for game state (avoids JSON overhead for known shape)
function deepClone(s: GameState): GameState {
  return {
    ...s,
    player:    { ...s.player },
    platforms: s.platforms,  // immutable per level
    enemies:   s.enemies.map(e => ({ ...e })),
    coinItems: s.coinItems.map(c => ({ ...c })),
    exit:      s.exit,
    waves:     s.waves.map(w => ({ ...w })),
    camera:    { ...s.camera },
  }
}

export { VISION_RADIUS }
