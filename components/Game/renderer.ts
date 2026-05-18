import type { GameState, Player, SoundWave } from './types'
import { LEVELS } from './levels'
import { VISION_RADIUS, ECHO_COOLDOWN } from './gameLogic'

const TILE_COLOR   = '#2a2218'
const TILE_EDGE    = '#c8a96e'
const DEADLY_COLOR = '#3a0808'
const DEADLY_EDGE  = '#c84040'
const ENEMY_COLOR  = '#c84040'
const COIN_COLOR   = '#40c880'
const EXIT_COLOR   = '#6088c8'
const EXIT_GLOW    = 'rgba(96,136,200,0.25)'

// Alert radius — enemies detected inside this range show a directional indicator
const ALERT_RADIUS = 380

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  W: number,
  H: number,
): void {
  ctx.clearRect(0, 0, W, H)
  const { camera: cam, player: p, waves } = state
  const lvl = LEVELS[state.level]

  // ── Scene canvas ──────────────────────────────────────────────────────────
  const scene = document.createElement('canvas')
  scene.width = W; scene.height = H
  const sc = scene.getContext('2d')!
  sc.save()
  sc.translate(-cam.x, -cam.y)

  sc.fillStyle = '#050505'
  sc.fillRect(cam.x, cam.y, W, H)

  // Exit
  const ex = state.exit
  sc.fillStyle = EXIT_GLOW
  sc.beginPath(); sc.arc(ex.x + ex.w / 2, ex.y + ex.h / 2, 60, 0, Math.PI * 2); sc.fill()
  sc.fillStyle = EXIT_COLOR; sc.fillRect(ex.x, ex.y, ex.w, ex.h)
  sc.strokeStyle = '#a0c0ff'; sc.lineWidth = 2; sc.strokeRect(ex.x, ex.y, ex.w, ex.h)

  // Platforms
  for (const plat of state.platforms) {
    if (plat.x + plat.w < cam.x || plat.x > cam.x + W) continue
    sc.fillStyle   = plat.type === 'deadly' ? DEADLY_COLOR : TILE_COLOR
    sc.strokeStyle = plat.type === 'deadly' ? DEADLY_EDGE  : TILE_EDGE
    sc.lineWidth   = 1.5
    sc.fillRect(plat.x, plat.y, plat.w, plat.h)
    sc.strokeRect(plat.x, plat.y, plat.w, plat.h)
    if (plat.type === 'deadly') {
      sc.fillStyle = DEADLY_EDGE
      for (let i = 0; i < plat.w; i += 16) {
        sc.beginPath()
        sc.moveTo(plat.x + i, plat.y)
        sc.lineTo(plat.x + i + 8, plat.y - 8)
        sc.lineTo(plat.x + i + 16, plat.y)
        sc.fill()
      }
    }
  }

  // Coins
  for (const c of state.coinItems) {
    if (c.collected) continue
    sc.fillStyle = COIN_COLOR; sc.strokeStyle = '#a0ffc0'; sc.lineWidth = 1.5
    sc.beginPath(); sc.arc(c.x, c.y, c.r, 0, Math.PI * 2); sc.fill(); sc.stroke()
  }

  // Enemies
  for (const e of state.enemies) {
    if (!e.alive) continue
    sc.fillStyle = ENEMY_COLOR; sc.strokeStyle = '#ff8080'; sc.lineWidth = 1.5
    sc.fillRect(e.x, e.y, e.w, e.h); sc.strokeRect(e.x, e.y, e.w, e.h)
    const eyeOff = e.vx > 0 ? e.w * 0.65 : e.w * 0.2
    sc.fillStyle = '#fff'; sc.beginPath(); sc.arc(e.x + eyeOff, e.y + e.h * 0.35, 4, 0, Math.PI * 2); sc.fill()
    sc.fillStyle = '#000'; sc.beginPath(); sc.arc(e.x + eyeOff + (e.vx > 0 ? 1.5 : -1.5), e.y + e.h * 0.35, 2, 0, Math.PI * 2); sc.fill()
  }

  // Player
  if (!p.dead) drawHumanPlayer(sc, p)

  // Sound waves — differentiated by type
  sc.lineCap = 'round'
  for (const w of waves) {
    renderWave(sc, w)
  }

  sc.restore()

  // ── Darkness + vision mask ─────────────────────────────────────────────────
  const psx = p.x + p.w / 2 - cam.x
  const psy = p.y + p.h / 2 - cam.y

  const dark = document.createElement('canvas')
  dark.width = W; dark.height = H
  const dc = dark.getContext('2d')!

  dc.fillStyle = '#000'
  dc.fillRect(0, 0, W, H)

  // Vision circle
  dc.globalCompositeOperation = 'destination-out'
  const grad = dc.createRadialGradient(psx, psy, 0, psx, psy, VISION_RADIUS)
  grad.addColorStop(0,    'rgba(0,0,0,1)')
  grad.addColorStop(0.6,  'rgba(0,0,0,0.92)')
  grad.addColorStop(0.85, 'rgba(0,0,0,0.5)')
  grad.addColorStop(1,    'rgba(0,0,0,0)')
  dc.fillStyle = grad
  dc.beginPath(); dc.arc(psx, psy, VISION_RADIUS, 0, Math.PI * 2); dc.fill()
  dc.globalCompositeOperation = 'source-over'

  // Waves punch through darkness (strength depends on type)
  for (const w of waves) {
    const wx = w.x - cam.x
    const wy = w.y - cam.y
    if (Math.hypot(wx - psx, wy - psy) - w.radius > VISION_RADIUS * 3.5) continue
    dc.globalCompositeOperation = 'destination-out'
    const strength = waveDarknessStrength(w)
    dc.beginPath()
    dc.arc(wx, wy, w.radius + 2, 0, Math.PI * 2)
    dc.strokeStyle = `rgba(0,0,0,${Math.min(w.alpha * strength, 0.88)})`
    dc.lineWidth = waveLineWidth(w) * 4
    dc.stroke()
    dc.globalCompositeOperation = 'source-over'
  }

  ctx.drawImage(scene, 0, 0)
  ctx.drawImage(dark, 0, 0)

  // ── Directional enemy alerts (drawn on final canvas, screen space) ─────────
  drawEnemyAlerts(ctx, state, psx, psy, cam.x, cam.y)

  // ── HUD ───────────────────────────────────────────────────────────────────
  drawHUD(ctx, state, W, H, lvl.name)
}

// ─── Wave rendering ───────────────────────────────────────────────────────────

function waveLineWidth(w: SoundWave): number {
  switch (w.type) {
    case 'echo':      return 3.5
    case 'enemy':     return 2.2
    case 'coin':      return 1.2
    case 'reflected': return 1.0
    default:          return 1.5
  }
}

function waveDarknessStrength(w: SoundWave): number {
  switch (w.type) {
    case 'echo':      return 1.6
    case 'enemy':     return 0.85
    case 'reflected': return 0.55
    case 'coin':      return 0.5
    default:          return 0.65
  }
}

function renderWave(sc: CanvasRenderingContext2D, w: SoundWave): void {
  const alpha = Math.min(w.alpha, 0.9)
  const color = w.color.replace(/[\d.]+\)$/, `${alpha})`)

  sc.lineWidth = waveLineWidth(w)
  sc.strokeStyle = color

  if (w.type === 'enemy') {
    // Dashed ring for enemies — more menacing feel
    sc.setLineDash([8, 6])
    sc.lineDashOffset = -w.radius * 0.4
  } else if (w.type === 'reflected') {
    sc.setLineDash([4, 8])
    sc.lineDashOffset = 0
  } else {
    sc.setLineDash([])
  }

  sc.beginPath()
  sc.arc(w.x, w.y, w.radius, 0, Math.PI * 2)
  sc.stroke()
  sc.setLineDash([])

  // Echo wave: extra outer glow ring
  if (w.type === 'echo' && w.alpha > 0.15) {
    sc.lineWidth = 1
    sc.strokeStyle = w.color.replace(/[\d.]+\)$/, `${alpha * 0.3})`)
    sc.beginPath()
    sc.arc(w.x, w.y, w.radius + 6, 0, Math.PI * 2)
    sc.stroke()
  }
}

// ─── Directional enemy alerts ─────────────────────────────────────────────────

function drawEnemyAlerts(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  psx: number, psy: number,
  camX: number, camY: number,
): void {
  const p = state.player
  const px = p.x + p.w / 2
  const py = p.y + p.h / 2

  for (const e of state.enemies) {
    if (!e.alive) continue
    const ex = e.x + e.w / 2
    const ey = e.y + e.h / 2
    const dist = Math.hypot(ex - px, ey - py)
    if (dist <= VISION_RADIUS || dist > ALERT_RADIUS) continue

    const angle = Math.atan2(ey - py, ex - px)
    const intensity = 1 - (dist - VISION_RADIUS) / (ALERT_RADIUS - VISION_RADIUS)

    // Pulsing arc on the edge of the vision circle
    const arcR = VISION_RADIUS - 4
    const arcSpan = 0.35 + intensity * 0.25
    const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 180)

    ctx.save()
    ctx.strokeStyle = `rgba(220,60,60,${intensity * pulse * 0.85})`
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(psx, psy, arcR, angle - arcSpan / 2, angle + arcSpan / 2)
    ctx.stroke()

    // Arrowhead pointing toward the enemy
    const tipX = psx + Math.cos(angle) * (arcR + 8)
    const tipY = psy + Math.sin(angle) * (arcR + 8)
    const left  = angle - 2.4
    const right = angle + 2.4
    ctx.fillStyle = `rgba(220,60,60,${intensity * pulse * 0.9})`
    ctx.beginPath()
    ctx.moveTo(tipX, tipY)
    ctx.lineTo(tipX + Math.cos(left)  * 7, tipY + Math.sin(left)  * 7)
    ctx.lineTo(tipX + Math.cos(right) * 7, tipY + Math.sin(right) * 7)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}

// ─── HUD ──────────────────────────────────────────────────────────────────────

function drawHUD(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  W: number,
  _H: number,
  levelName: string,
): void {
  ctx.save()
  ctx.font = '13px "Courier New", monospace'
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, 0, W, 38)
  ctx.fillStyle = '#c8a96e'
  ctx.fillText(`NIVEAU ${state.level + 1} — ${levelName}`, 16, 22)
  ctx.fillText(`♦ ${state.coins}/${state.totalCoins}`, W / 2 - 40, 22)
  ctx.fillText(`♥ × ${state.lives}`, W - 100, 22)

  // Echo cooldown indicator (bottom-left)
  drawEchoCooldown(ctx, state)

  ctx.restore()
}

function drawEchoCooldown(ctx: CanvasRenderingContext2D, state: GameState): void {
  const x = 28, y = 510, r = 16
  const ready = state.echoCooldown === 0
  const progress = ready ? 1 : 1 - state.echoCooldown / ECHO_COOLDOWN

  // Background circle
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fill()

  // Progress arc
  ctx.beginPath()
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2)
  ctx.strokeStyle = ready ? 'rgba(140,220,255,0.9)' : 'rgba(140,220,255,0.45)'
  ctx.lineWidth = 3
  ctx.stroke()

  // E label
  ctx.font = ready ? 'bold 11px "Courier New"' : '11px "Courier New"'
  ctx.fillStyle = ready ? 'rgba(140,220,255,0.95)' : 'rgba(140,220,255,0.4)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('E', x, y)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // Glow when ready
  if (ready) {
    ctx.beginPath()
    ctx.arc(x, y, r + 3, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(140,220,255,0.2)'
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

// ─── Human player ─────────────────────────────────────────────────────────────

function drawHumanPlayer(sc: CanvasRenderingContext2D, p: Player): void {
  const cx       = p.x + p.w / 2
  const headCY   = p.y + 5
  const shoulderY = p.y + 16
  const hipY      = p.y + 28
  const headR     = 8

  const isJumping = !p.onGround && p.vy < 0
  const isFalling = !p.onGround && p.vy >= 2
  const isMoving  = Math.abs(p.vx) > 0.5
  const phase     = (p.animFrame % 20) / 20 * Math.PI * 2

  let lLeg: number, rLeg: number, lArm: number, rArm: number

  if (isJumping) {
    lLeg = -0.3;  rLeg = -0.3
    lArm = -1.05; rArm = -1.05
  } else if (isFalling) {
    lLeg =  0.18; rLeg =  0.18
    lArm = -0.55; rArm = -0.55
  } else if (isMoving) {
    lLeg =  Math.sin(phase) * 0.52
    rLeg = -lLeg
    lArm = -lLeg * 0.55
    rArm =  lLeg * 0.55
  } else {
    lLeg = 0.04; rLeg = -0.04
    lArm = 0.08; rArm = -0.08
  }

  const backLegA  = p.facing === 1 ? lLeg : rLeg
  const frontLegA = p.facing === 1 ? rLeg : lLeg
  const backArmA  = p.facing === 1 ? lArm : rArm
  const frontArmA = p.facing === 1 ? rArm : lArm

  const SKIN_DARK = '#b88848'
  const SKIN      = '#d4a462'
  const BODY_COL  = '#6b4e28'
  const BLINDFOLD = '#1a0800'
  const HAIR      = '#3a2210'

  sc.lineCap = 'round'; sc.lineJoin = 'round'

  drawLimb(sc, cx, hipY,      p.facing * backLegA,  11, 10, 5, 4, SKIN_DARK, SKIN_DARK)
  drawLimb(sc, cx, shoulderY, p.facing * backArmA,  8,  7,  4, 3, SKIN_DARK, SKIN_DARK)

  // Torso
  sc.fillStyle = BODY_COL
  sc.beginPath()
  sc.moveTo(cx - 5, shoulderY - 2)
  sc.lineTo(cx + 5, shoulderY - 2)
  sc.lineTo(cx + 4, hipY)
  sc.lineTo(cx - 4, hipY)
  sc.closePath(); sc.fill()

  // Head
  sc.fillStyle = SKIN
  sc.beginPath(); sc.arc(cx, headCY, headR, 0, Math.PI * 2); sc.fill()
  sc.fillStyle = HAIR
  sc.beginPath(); sc.arc(cx, headCY, headR, Math.PI, Math.PI * 2); sc.fill()
  sc.fillRect(cx - headR, headCY - headR, headR * 2, 3)

  // Blindfold
  sc.fillStyle = BLINDFOLD
  sc.fillRect(cx - headR + 1, headCY - 1, (headR - 1) * 2, 5)

  // Nose
  sc.fillStyle = '#b87840'
  sc.beginPath(); sc.arc(cx + p.facing * 5, headCY + 3, 2, 0, Math.PI * 2); sc.fill()

  drawLimb(sc, cx, hipY,      p.facing * frontLegA, 11, 10, 5, 4, SKIN, SKIN)
  drawLimb(sc, cx, shoulderY, p.facing * frontArmA, 8,  7,  4, 3, SKIN, SKIN)
}

function drawLimb(
  sc: CanvasRenderingContext2D,
  ox: number, oy: number, angle: number,
  seg1: number, seg2: number,
  w1: number, w2: number,
  col1: string, col2: string,
): void {
  const jx = ox + Math.sin(angle) * seg1
  const jy = oy + Math.cos(angle) * seg1
  sc.strokeStyle = col1; sc.lineWidth = w1
  sc.beginPath(); sc.moveTo(ox, oy); sc.lineTo(jx, jy); sc.stroke()
  const bend = angle + Math.sign(angle) * 0.18
  const ex = jx + Math.sin(bend) * seg2
  const ey = jy + Math.cos(bend) * seg2
  sc.strokeStyle = col2; sc.lineWidth = w2
  sc.beginPath(); sc.moveTo(jx, jy); sc.lineTo(ex, ey); sc.stroke()
}
