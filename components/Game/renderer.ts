import type { GameState } from './types'
import { LEVELS } from './levels'
import { VISION_RADIUS } from './gameLogic'

const TILE_COLOR         = '#2a2218'
const TILE_EDGE          = '#c8a96e'
const DEADLY_COLOR       = '#3a0808'
const DEADLY_EDGE        = '#c84040'
const PLAYER_COLOR       = '#e8c97e'
const PLAYER_EYE_COLOR   = '#000'
const ENEMY_COLOR        = '#c84040'
const COIN_COLOR         = '#40c880'
const EXIT_COLOR         = '#6088c8'
const EXIT_GLOW          = 'rgba(96,136,200,0.25)'

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  W: number,
  H: number,
): void {
  ctx.clearRect(0, 0, W, H)

  const { camera: cam, player: p, waves } = state
  const lvl = LEVELS[state.level]

  // ── Off-screen canvas for the lit scene ─────────────────────────────────
  const scene = document.createElement('canvas')
  scene.width  = W
  scene.height = H
  const sc = scene.getContext('2d')!

  sc.save()
  sc.translate(-cam.x, -cam.y)

  // background
  sc.fillStyle = '#050505'
  sc.fillRect(cam.x, cam.y, W, H)

  // exit glow
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

  // platforms
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

  // coins
  for (const c of state.coinItems) {
    if (c.collected) continue
    sc.fillStyle   = COIN_COLOR
    sc.strokeStyle = '#a0ffc0'
    sc.lineWidth   = 1.5
    sc.beginPath()
    sc.arc(c.x, c.y, c.r, 0, Math.PI * 2)
    sc.fill()
    sc.stroke()
  }

  // enemies
  for (const e of state.enemies) {
    if (!e.alive) continue
    sc.fillStyle   = ENEMY_COLOR
    sc.strokeStyle = '#ff8080'
    sc.lineWidth   = 1.5
    sc.fillRect(e.x, e.y, e.w, e.h)
    sc.strokeRect(e.x, e.y, e.w, e.h)
    // eyes
    sc.fillStyle = '#fff'
    const eyeOff = e.vx > 0 ? e.w * 0.6 : e.w * 0.2
    sc.beginPath()
    sc.arc(e.x + eyeOff, e.y + e.h * 0.35, 4, 0, Math.PI * 2)
    sc.fill()
    sc.fillStyle = '#000'
    sc.beginPath()
    sc.arc(e.x + eyeOff + (e.vx > 0 ? 1 : -1), e.y + e.h * 0.35, 2, 0, Math.PI * 2)
    sc.fill()
  }

  // player
  if (!p.dead) {
    drawPlayer(sc, p)
  }

  // sound waves
  for (const w of waves) {
    sc.beginPath()
    sc.arc(w.x, w.y, w.radius, 0, Math.PI * 2)
    sc.strokeStyle = w.color.replace(/[\d.]+\)$/, `${w.alpha})`)
    sc.lineWidth = 1.5
    sc.stroke()
  }

  sc.restore()

  // ── Darkness overlay with vision hole ───────────────────────────────────
  const playerScreenX = p.x + p.w / 2 - cam.x
  const playerScreenY = p.y + p.h / 2 - cam.y

  const darkLayer = document.createElement('canvas')
  darkLayer.width  = W
  darkLayer.height = H
  const dc = darkLayer.getContext('2d')!

  // Full black
  dc.fillStyle = '#000'
  dc.fillRect(0, 0, W, H)

  // Cut out vision circle using destination-out
  dc.globalCompositeOperation = 'destination-out'
  const grad = dc.createRadialGradient(
    playerScreenX, playerScreenY, 0,
    playerScreenX, playerScreenY, VISION_RADIUS,
  )
  grad.addColorStop(0,    'rgba(0,0,0,1)')
  grad.addColorStop(0.6,  'rgba(0,0,0,0.9)')
  grad.addColorStop(0.85, 'rgba(0,0,0,0.5)')
  grad.addColorStop(1,    'rgba(0,0,0,0)')
  dc.fillStyle = grad
  dc.beginPath()
  dc.arc(playerScreenX, playerScreenY, VISION_RADIUS, 0, Math.PI * 2)
  dc.fill()
  dc.globalCompositeOperation = 'source-over'

  // Make waves partially visible through darkness
  for (const w of waves) {
    const wx = w.x - cam.x
    const wy = w.y - cam.y
    const dist = Math.sqrt((wx - playerScreenX) ** 2 + (wy - playerScreenY) ** 2)
    if (dist - w.radius > VISION_RADIUS * 3) continue

    dc.globalCompositeOperation = 'destination-out'
    const wAlpha = Math.min(w.alpha * 0.7, 0.65)
    dc.beginPath()
    dc.arc(wx, wy, w.radius + 1, 0, Math.PI * 2)
    dc.strokeStyle = `rgba(0,0,0,${wAlpha})`
    dc.lineWidth = 6
    dc.stroke()
    dc.globalCompositeOperation = 'source-over'
  }

  // Composite
  ctx.drawImage(scene, 0, 0)
  ctx.drawImage(darkLayer, 0, 0)

  // ── HUD ──────────────────────────────────────────────────────────────────
  drawHUD(ctx, state, W, H, lvl.name)
}

function drawPlayer(sc: CanvasRenderingContext2D, p: { x: number; y: number; w: number; h: number; facing: 1 | -1 }): void {
  // body
  sc.fillStyle   = PLAYER_COLOR
  sc.strokeStyle = '#f0e8d0'
  sc.lineWidth   = 1.5
  sc.fillRect(p.x, p.y, p.w, p.h)
  sc.strokeRect(p.x, p.y, p.w, p.h)

  // head
  sc.fillStyle   = '#d4b870'
  sc.fillRect(p.x + 2, p.y - 10, p.w - 4, 12)
  sc.strokeRect(p.x + 2, p.y - 10, p.w - 4, 12)

  // blindfold
  sc.fillStyle = '#2a1a0a'
  sc.fillRect(p.x + 2, p.y - 8, p.w - 4, 5)

  // eye areas (closed / blind)
  const eyeX = p.facing === 1 ? p.x + p.w * 0.65 : p.x + p.w * 0.15
  sc.fillStyle   = PLAYER_EYE_COLOR
  sc.strokeStyle = '#60504020'
  sc.lineWidth = 0.8
  sc.beginPath()
  sc.arc(eyeX, p.y - 5, 2.5, 0, Math.PI * 2)
  sc.fill()
}

function drawHUD(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  W: number,
  H: number,
  levelName: string,
): void {
  ctx.save()
  ctx.font = '13px "Courier New", monospace'
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, 0, W, 38)

  ctx.fillStyle = '#c8a96e'
  ctx.fillText(`NIVEAU ${state.level + 1} — ${levelName}`, 16, 22)

  const coinsText = `♦ ${state.coins}/${state.totalCoins}`
  ctx.fillText(coinsText, W / 2 - 40, 22)

  const livesText = `♥ × ${state.lives}`
  ctx.fillText(livesText, W - 100, 22)

  ctx.restore()
}
