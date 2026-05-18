export type AudioEvent =
  | 'jump' | 'land' | 'coin' | 'stomp' | 'death' | 'levelComplete' | 'footstep'

let ctx: AudioContext | null = null
let musicEl: HTMLAudioElement | null = null
let musicGain: GainNode | null = null

export function initAudio(): void {
  if (ctx) return
  ctx = new AudioContext()
  musicGain = ctx.createGain()
  musicGain.gain.value = 0.45
  musicGain.connect(ctx.destination)
}

export function resumeAudio(): void {
  ctx?.resume()
}

export function playMusic(): void {
  if (musicEl) return
  musicEl = new Audio('/gaming/musique.mp3')
  musicEl.loop = true
  musicEl.volume = 0.45
  musicEl.play().catch(() => {})
}

export function stopMusic(): void {
  if (!musicEl) return
  musicEl.pause()
  musicEl.currentTime = 0
  musicEl = null
}

export function playSfx(type: AudioEvent): void {
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume()
  switch (type) {
    case 'jump':        sfxJump();         break
    case 'land':        sfxLand();         break
    case 'coin':        sfxCoin();         break
    case 'stomp':       sfxStomp();        break
    case 'death':       sfxDeath();        break
    case 'levelComplete': sfxLevelComplete(); break
    case 'footstep':    sfxFootstep();     break
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function osc(
  type: OscillatorType,
  f0: number, f1: number,
  duration: number,
  g0: number, g1 = 0.001,
  delayStart = 0,
): void {
  if (!ctx) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.connect(g); g.connect(ctx.destination)
  o.type = type
  const t = ctx.currentTime + delayStart
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + duration)
  g.gain.setValueAtTime(g0, t)
  g.gain.exponentialRampToValueAtTime(Math.max(g1, 0.001), t + duration)
  o.start(t)
  o.stop(t + duration + 0.01)
}

function noise(duration: number, gain: number, lpFreq = 4000, delayStart = 0): void {
  if (!ctx) return
  const n = Math.ceil(ctx.sampleRate * duration)
  const buf = ctx.createBuffer(1, n, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = lpFreq
  const g = ctx.createGain()
  const t = ctx.currentTime + delayStart
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + duration)
  src.connect(lp); lp.connect(g); g.connect(ctx.destination)
  src.start(t); src.stop(t + duration + 0.01)
}

// ─── SFX definitions ────────────────────────────────────────────────────────

function sfxJump(): void {
  osc('sine', 220, 520, 0.12, 0.28)
}

function sfxLand(): void {
  noise(0.07, 0.35, 300)
  osc('sine', 90, 60, 0.07, 0.4)
}

function sfxFootstep(): void {
  noise(0.04, 0.12, 250)
}

function sfxCoin(): void {
  osc('sine', 880, 1320, 0.06, 0.35)
  osc('sine', 1320, 1760, 0.1, 0.3, 0.001, 0.06)
}

function sfxStomp(): void {
  osc('square', 120, 50, 0.15, 0.5)
  noise(0.1, 0.4, 600)
}

function sfxDeath(): void {
  osc('sawtooth', 380, 80, 0.9, 0.4)
  noise(0.5, 0.2, 800, 0.1)
}

function sfxLevelComplete(): void {
  const notes = [261.6, 329.6, 392, 523.2]
  notes.forEach((f, i) => osc('sine', f, f, 0.18, 0.4, 0.001, i * 0.18))
}
