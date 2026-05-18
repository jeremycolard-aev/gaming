import type { GameState, Player, Platform, SoundWave, WaveType } from './types'
import { LEVELS } from './levels'

const GRAVITY       = 0.55
const JUMP_FORCE    = -13
const MOVE_SPEED    = 4.2
const FRICTION      = 0.82
const VISION_RADIUS = 110
const CAM_LERP      = 0.12
const ECHO_COOLDOWN = 240        // 4 s at 60 fps
const MAX_WAVES     = 80         // perf cap
const REFLECT_DIST  = 500        // platforms beyond this are ignored for reflection

export function buildInitialState(level: number, lives: number): GameState {
  const lvl = LEVELS[level]
  return {
    phase: 'playing', level, lives,
    coins: 0, totalCoins: lvl.coins.length,
    player: {
      x: lvl.playerStart.x, y: lvl.playerStart.y,
      w: 24, h: 36,
      vx: 0, vy: 0,
      onGround: false, facing: 1,
      dead: false, respawnTimer: 0, animFrame: 0,
    },
    platforms: lvl.platforms.map(p => ({ ...p })),
    enemies:   lvl.enemies.map(e => ({ ...e })),
    coinItems: lvl.coins.map(c => ({ ...c })),
    exit: { ...lvl.exit },
    waves: [],
    camera: { x: lvl.playerStart.x - 400, y: 0 },
    playerWaveTimer: 0,
    deathTimer: 0, levelTimer: 0,
    audioEvents: [],
    echoCooldown: 0,
  }
}

// ─── geometry helpers ────────────────────────────────────────────────────────

function rectOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

function resolvePlatformCollision(p: Player, plat: Platform): void {
  const ox = Math.min(p.x + p.w, plat.x + plat.w) - Math.max(p.x, plat.x)
  const oy = Math.min(p.y + p.h, plat.y + plat.h) - Math.max(p.y, plat.y)
  if (ox <= 0 || oy <= 0) return
  if (ox < oy) {
    p.x += p.x < plat.x ? -ox : ox; p.vx = 0
  } else {
    if (p.y < plat.y) { p.y = plat.y - p.h; p.vy = 0; p.onGround = true }
    else              { p.y = plat.y + plat.h; p.vy = 0 }
  }
}

/** Closest point on an AABB to a circle center; returns squared distance. */
function closestPointOnRect(
  wx: number, wy: number, plat: Platform,
): { x: number; y: number; distSq: number } {
  const cx = Math.max(plat.x, Math.min(wx, plat.x + plat.w))
  const cy = Math.max(plat.y, Math.min(wy, plat.y + plat.h))
  return { x: cx, y: cy, distSq: (cx - wx) ** 2 + (cy - wy) ** 2 }
}

// ─── wave helpers ────────────────────────────────────────────────────────────

function spawnWave(
  state: GameState,
  x: number, y: number,
  color: string,
  maxRadius: number,
  speed: number,
  type: WaveType = 'player',
  depth = 0,
): void {
  if (state.waves.length >= MAX_WAVES) return
  state.waves.push({ x, y, radius: 6, maxRadius, alpha: 0.72, color, speed, type, depth })
}

/** Spawn reflected child waves when a wave ring crosses a platform surface. */
function spawnReflections(state: GameState, w: SoundWave): void {
  if (w.depth > 0) return  // no second-order reflections
  const prevR = w.radius - w.speed

  for (const plat of state.platforms) {
    if (plat.type === 'deadly') continue
    // Skip platforms far from the wave source
    const platCX = plat.x + plat.w / 2
    const platCY = plat.y + plat.h / 2
    if (Math.hypot(platCX - w.x, platCY - w.y) > REFLECT_DIST) continue

    const { x: nx, y: ny, distSq } = closestPointOnRect(w.x, w.y, plat)
    const dist = Math.sqrt(distSq)
    // Did the ring cross this surface this frame?
    if (prevR < dist && dist <= w.radius) {
      const reflColor = w.color.replace(/[\d.]+\)$/, '0.45)')
      spawnWave(state, nx, ny, reflColor, w.maxRadius * 0.42, w.speed * 0.7, 'reflected', 1)
    }
  }
}

// ─── main step ───────────────────────────────────────────────────────────────

export function stepGame(
  state: GameState,
  keys: Set<string>,
  canvasW: number,
  canvasH: number,
): GameState {
  if (state.phase !== 'playing') return state

  const s = deepClone(state)
  s.audioEvents = []
  const p = s.player
  const lvl = LEVELS[s.level]

  s.levelTimer++

  // ── Input ────────────────────────────────────────────────────────────────
  const left  = keys.has('ArrowLeft')  || keys.has('KeyA')
  const right = keys.has('ArrowRight') || keys.has('KeyD')
  const jump  = keys.has('ArrowUp')    || keys.has('KeyW') || keys.has('Space')
  const echo  = keys.has('KeyE')

  if (left)  { p.vx -= MOVE_SPEED * 0.35; p.facing = -1 }
  if (right) { p.vx += MOVE_SPEED * 0.35; p.facing =  1 }
  if (!left && !right) p.vx *= FRICTION
  p.vx = Math.max(-MOVE_SPEED, Math.min(MOVE_SPEED, p.vx))

  const wasOnGround = p.onGround

  if (jump && p.onGround) {
    p.vy = JUMP_FORCE; p.onGround = false
    s.audioEvents.push('jump')
    spawnWave(s, p.x + p.w / 2, p.y + p.h, 'rgba(200,169,110,0.65)', 90, 2.8, 'player')
  }

  // ── Echo pulse (E key) ──────────────────────────────────────────────────
  if (s.echoCooldown > 0) s.echoCooldown--

  if (echo && s.echoCooldown === 0) {
    s.echoCooldown = ECHO_COOLDOWN
    s.audioEvents.push('echo')
    spawnWave(s, p.x + p.w / 2, p.y + p.h / 2, 'rgba(140,220,255,0.85)', 520, 4.5, 'echo')
  }

  // ── Physics ──────────────────────────────────────────────────────────────
  p.vy += GRAVITY
  p.vy  = Math.min(p.vy, 20)
  p.x  += p.vx; p.y += p.vy
  p.x   = Math.max(0, Math.min(p.x, lvl.worldWidth - p.w))
  p.onGround = false

  for (const plat of s.platforms) {
    if (!rectOverlap(p.x, p.y, p.w, p.h, plat.x, plat.y, plat.w, plat.h)) continue
    if (plat.type === 'deadly') { p.dead = true; break }
    resolvePlatformCollision(p, plat)
  }

  if (p.y > lvl.worldHeight + 100) p.dead = true
  if (!wasOnGround && p.onGround)   s.audioEvents.push('land')

  // ── Animation ────────────────────────────────────────────────────────────
  if (p.onGround && Math.abs(p.vx) > 0.8) p.animFrame++

  // ── Footstep wave ────────────────────────────────────────────────────────
  s.playerWaveTimer++
  if (s.playerWaveTimer >= 38 && p.onGround && Math.abs(p.vx) > 0.5) {
    s.playerWaveTimer = 0
    spawnWave(s, p.x + p.w / 2, p.y + p.h, 'rgba(200,169,110,0.35)', 65, 1.6, 'player')
    s.audioEvents.push('footstep')
  }

  // ── Enemies ──────────────────────────────────────────────────────────────
  for (const e of s.enemies) {
    if (!e.alive) continue
    e.x += e.vx
    if (e.x < e.startX || e.x > e.startX + e.patrolRange) e.vx *= -1

    e.waveTimer++
    if (e.waveTimer >= e.waveInterval) {
      e.waveTimer = 0
      spawnWave(s, e.x + e.w / 2, e.y + e.h / 2, 'rgba(210,70,70,0.72)', 200, 1.8, 'enemy')
    }

    const stompY = p.y + p.h
    const prevY  = stompY - p.vy
    if (p.vy > 0 && prevY <= e.y && rectOverlap(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) {
      e.alive = false; p.vy = JUMP_FORCE * 0.6
      s.audioEvents.push('stomp')
      spawnWave(s, e.x + e.w / 2, e.y + e.h / 2, 'rgba(255,200,80,0.85)', 130, 3.2, 'enemy')
    } else if (rectOverlap(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) {
      p.dead = true
    }
  }

  // ── Coins ────────────────────────────────────────────────────────────────
  for (const c of s.coinItems) {
    if (c.collected) continue
    c.waveTimer++
    if (c.waveTimer >= 110) {
      c.waveTimer = 0
      spawnWave(s, c.x, c.y, 'rgba(70,210,130,0.55)', 90, 1.3, 'coin')
    }
    const dx = p.x + p.w / 2 - c.x
    const dy = p.y + p.h / 2 - c.y
    if (Math.hypot(dx, dy) < p.w / 2 + c.r) {
      c.collected = true; s.coins++
      s.audioEvents.push('coin')
      spawnWave(s, c.x, c.y, 'rgba(70,210,130,0.95)', 70, 3.5, 'coin')
    }
  }

  // ── Exit ─────────────────────────────────────────────────────────────────
  const ex = s.exit
  if (rectOverlap(p.x, p.y, p.w, p.h, ex.x, ex.y, ex.w, ex.h)) {
    s.phase = s.level < LEVELS.length - 1 ? 'levelComplete' : 'victory'
    s.audioEvents.push('levelComplete')
  }

  // ── Waves update + reflections ────────────────────────────────────────────
  s.waves = s.waves.filter(w => w.alpha > 0.01)
  for (const w of s.waves) {
    // Spawn reflections before radius advances
    spawnReflections(s, w)
    w.radius += w.speed
    w.alpha  *= 0.968
    if (w.radius >= w.maxRadius) w.alpha = 0
  }

  // ── Camera ───────────────────────────────────────────────────────────────
  const tcx = p.x - canvasW / 2 + p.w / 2
  const tcy = p.y - canvasH / 2 + p.h / 2
  s.camera.x += (tcx - s.camera.x) * CAM_LERP
  s.camera.y += (tcy - s.camera.y) * CAM_LERP
  s.camera.x  = Math.max(0, Math.min(s.camera.x, lvl.worldWidth  - canvasW))
  s.camera.y  = Math.max(0, Math.min(s.camera.y, lvl.worldHeight - canvasH))

  // ── Death ────────────────────────────────────────────────────────────────
  if (p.dead) {
    if (s.deathTimer === 0) s.audioEvents.push('death')
    s.deathTimer++
    if (s.deathTimer > 80) {
      const nl = s.lives - 1
      if (nl <= 0) { s.lives = 0; s.phase = 'dead' }
      else          return buildInitialState(s.level, nl)
    }
  }

  return s
}

function deepClone(s: GameState): GameState {
  return {
    ...s,
    player:    { ...s.player },
    platforms: s.platforms,
    enemies:   s.enemies.map(e => ({ ...e })),
    coinItems: s.coinItems.map(c => ({ ...c })),
    exit:      s.exit,
    waves:     s.waves.map(w => ({ ...w })),
    camera:    { ...s.camera },
    audioEvents: [],
  }
}

export { VISION_RADIUS, ECHO_COOLDOWN }
