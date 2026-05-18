import type { GameState, Player } from './types'
import { LEVELS } from './levels'
import { VISION_RADIUS } from './gameLogic'

const TILE_COLOR   = '#2a2218'
const TILE_EDGE    = '#c8a96e'
const DEADLY_COLOR = '#3a0808'
const DEADLY_EDGE  = '#c84040'
const ENEMY_COLOR  = '#c84040'
const COIN_COLOR   = '#40c880'
const EXIT_COLOR   = '#6088c8'
const EXIT_GLOW    = 'rgba(96,136,200,0.25)'

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  W: number,
  H: number,
): void {
  ctx.clearRect(0, 0, W, H)

  const { camera: cam, player: p, waves } = state
  const lvl = LEVELS[state.level]

  // ── Scene canvas ─────────────────────────────────────────────────────────
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
  sc.beginPath()
  sc.arc(ex.x + ex.w / 2, ex.y + ex.h / 2, 60, 0, Math.PI * 2)
  sc.fill()
  sc.fillStyle = EXIT_COLOR
  sc.fillRect(ex.x, ex.y, ex.w, ex.h)
  sc.strokeStyle = '#a0c0ff'
  sc.lineWidth = 2
  sc.strokeRect(ex.x, ex.y, ex.w, ex.h)

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
    sc.fillStyle   = COIN_COLOR
    sc.strokeStyle = '#a0ffc0'
    sc.lineWidth   = 1.5
    sc.beginPath()
    sc.arc(c.x, c.y, c.r, 0, Math.PI * 2)
    sc.fill(); sc.stroke()
  }

  // Enemies
  for (const e of state.enemies) {
    if (!e.alive) continue
    sc.fillStyle   = ENEMY_COLOR
    sc.strokeStyle = '#ff8080'
    sc.lineWidth   = 1.5
    sc.fillRect(e.x, e.y, e.w, e.h)
    sc.strokeRect(e.x, e.y, e.w, e.h)
    const eyeOff = e.vx > 0 ? e.w * 0.65 : e.w * 0.2
    sc.fillStyle = '#fff'
    sc.beginPath(); sc.arc(e.x + eyeOff, e.y + e.h * 0.35, 4, 0, Math.PI * 2); sc.fill()
    sc.fillStyle = '#000'
    sc.beginPath(); sc.arc(e.x + eyeOff + (e.vx > 0 ? 1.5 : -1.5), e.y + e.h * 0.35, 2, 0, Math.PI * 2); sc.fill()
  }

  // Player
  if (!p.dead) drawHumanPlayer(sc, p)

  // Sound waves
  sc.lineCap = 'butt'
  for (const w of waves) {
    sc.beginPath()
    sc.arc(w.x, w.y, w.radius, 0, Math.PI * 2)
    sc.strokeStyle = w.color.replace(/[\d.]+\)$/, `${w.alpha})`)
    sc.lineWidth = 1.5
    sc.stroke()
  }

  sc.restore()

  // ── Darkness + vision mask ────────────────────────────────────────────────
  const psx = p.x + p.w / 2 - cam.x
  const psy = p.y + p.h / 2 - cam.y

  const dark = document.createElement('canvas')
  dark.width = W; dark.height = H
  const dc = dark.getContext('2d')!

  dc.fillStyle = '#000'
  dc.fillRect(0, 0, W, H)

  dc.globalCompositeOperation = 'destination-out'
  const grad = dc.createRadialGradient(psx, psy, 0, psx, psy, VISION_RADIUS)
  grad.addColorStop(0,    'rgba(0,0,0,1)')
  grad.addColorStop(0.6,  'rgba(0,0,0,0.92)')
  grad.addColorStop(0.85, 'rgba(0,0,0,0.5)')
  grad.addColorStop(1,    'rgba(0,0,0,0)')
  dc.fillStyle = grad
  dc.beginPath()
  dc.arc(psx, psy, VISION_RADIUS, 0, Math.PI * 2)
  dc.fill()
  dc.globalCompositeOperation = 'source-over'

  for (const w of waves) {
    const wx = w.x - cam.x
    const wy = w.y - cam.y
    const dist = Math.hypot(wx - psx, wy - psy)
    if (dist - w.radius > VISION_RADIUS * 3) continue
    dc.globalCompositeOperation = 'destination-out'
    dc.beginPath()
    dc.arc(wx, wy, w.radius + 1, 0, Math.PI * 2)
    dc.strokeStyle = `rgba(0,0,0,${Math.min(w.alpha * 0.7, 0.65)})`
    dc.lineWidth = 6
    dc.stroke()
    dc.globalCompositeOperation = 'source-over'
  }

  ctx.drawImage(scene, 0, 0)
  ctx.drawImage(dark, 0, 0)

  // ── HUD ───────────────────────────────────────────────────────────────────
  ctx.save()
  ctx.font = '13px "Courier New", monospace'
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, 0, W, 38)
  ctx.fillStyle = '#c8a96e'
  ctx.fillText(`NIVEAU ${state.level + 1} — ${lvl.name}`, 16, 22)
  ctx.fillText(`♦ ${state.coins}/${state.totalCoins}`, W / 2 - 40, 22)
  ctx.fillText(`♥ × ${state.lives}`, W - 100, 22)
  ctx.restore()
}

// ─── Human player ─────────────────────────────────────────────────────────────

function drawHumanPlayer(sc: CanvasRenderingContext2D, p: Player): void {
  const cx  = p.x + p.w / 2
  // Vertical anchor points
  const headCY   = p.y + 5       // head centre
  const shoulderY = p.y + 16     // arm attachment
  const hipY      = p.y + 28     // leg attachment
  const headR     = 8

  const isJumping = !p.onGround && p.vy < 0
  const isFalling = !p.onGround && p.vy >= 2
  const isMoving  = Math.abs(p.vx) > 0.5

  // Walk cycle — phase in [0, 2π)
  const phase = (p.animFrame % 20) / 20 * Math.PI * 2

  // Limb angles (radians from vertical; positive = lean in facing direction)
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

  // Which side is "back" (drawn first, darker)
  // Facing right: left = back; facing left: right = back
  const backLegAngle  = p.facing ===  1 ? lLeg  : rLeg
  const frontLegAngle = p.facing ===  1 ? rLeg  : lLeg
  const backArmAngle  = p.facing ===  1 ? lArm  : rArm
  const frontArmAngle = p.facing ===  1 ? rArm  : lArm

  // Colours
  const SKIN_DARK  = '#b88848'  // back limbs / shadow side of face
  const SKIN       = '#d4a462'  // front limbs
  const BODY_COL   = '#6b4e28'  // torso
  const BLINDFOLD  = '#1a0800'
  const HAIR       = '#3a2210'

  sc.lineCap = 'round'
  sc.lineJoin = 'round'

  // ── Back leg ─────────────────────────────────────────────────────────────
  drawLimb(sc, cx, hipY, p.facing * backLegAngle, 11, 10, 5, 4, SKIN_DARK, SKIN_DARK)

  // ── Back arm ─────────────────────────────────────────────────────────────
  drawLimb(sc, cx, shoulderY, p.facing * backArmAngle, 8, 7, 4, 3, SKIN_DARK, SKIN_DARK)

  // ── Torso ─────────────────────────────────────────────────────────────────
  sc.fillStyle = BODY_COL
  sc.beginPath()
  sc.moveTo(cx - 5, shoulderY - 2)
  sc.lineTo(cx + 5, shoulderY - 2)
  sc.lineTo(cx + 4, hipY)
  sc.lineTo(cx - 4, hipY)
  sc.closePath()
  sc.fill()

  // ── Head ──────────────────────────────────────────────────────────────────
  sc.fillStyle = SKIN
  sc.beginPath()
  sc.arc(cx, headCY, headR, 0, Math.PI * 2)
  sc.fill()

  // Hair
  sc.fillStyle = HAIR
  sc.beginPath()
  sc.arc(cx, headCY, headR, Math.PI, Math.PI * 2)
  sc.fill()
  sc.fillRect(cx - headR, headCY - headR, headR * 2, 3)

  // Blindfold
  sc.fillStyle = BLINDFOLD
  sc.fillRect(cx - headR + 1, headCY - 1, (headR - 1) * 2, 5)

  // Nose
  sc.fillStyle = '#b87840'
  sc.beginPath()
  sc.arc(cx + p.facing * 5, headCY + 3, 2, 0, Math.PI * 2)
  sc.fill()

  // ── Front leg ────────────────────────────────────────────────────────────
  drawLimb(sc, cx, hipY, p.facing * frontLegAngle, 11, 10, 5, 4, SKIN, SKIN)

  // ── Front arm ────────────────────────────────────────────────────────────
  drawLimb(sc, cx, shoulderY, p.facing * frontArmAngle, 8, 7, 4, 3, SKIN, SKIN)
}

function drawLimb(
  sc: CanvasRenderingContext2D,
  ox: number, oy: number,
  angle: number,
  seg1: number, seg2: number,
  w1: number, w2: number,
  col1: string, col2: string,
): void {
  // Joint position
  const jx = ox + Math.sin(angle) * seg1
  const jy = oy + Math.cos(angle) * seg1

  sc.strokeStyle = col1
  sc.lineWidth   = w1
  sc.beginPath()
  sc.moveTo(ox, oy)
  sc.lineTo(jx, jy)
  sc.stroke()

  // End segment with slight natural bend at joint
  const bendAngle = angle + Math.sign(angle) * 0.18
  const ex = jx + Math.sin(bendAngle) * seg2
  const ey = jy + Math.cos(bendAngle) * seg2

  sc.strokeStyle = col2
  sc.lineWidth   = w2
  sc.beginPath()
  sc.moveTo(jx, jy)
  sc.lineTo(ex, ey)
  sc.stroke()
}
