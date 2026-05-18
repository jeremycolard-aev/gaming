export interface Vec2 {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Player {
  x: number
  y: number
  w: number
  h: number
  vx: number
  vy: number
  onGround: boolean
  facing: 1 | -1
  dead: boolean
  respawnTimer: number
}

export interface Platform {
  x: number
  y: number
  w: number
  h: number
  type: 'solid' | 'deadly'
}

export interface Enemy {
  x: number
  y: number
  w: number
  h: number
  vx: number
  startX: number
  patrolRange: number
  waveTimer: number
  waveInterval: number
  alive: boolean
}

export interface Coin {
  x: number
  y: number
  r: number
  collected: boolean
  waveTimer: number
}

export interface Exit {
  x: number
  y: number
  w: number
  h: number
}

export interface SoundWave {
  x: number
  y: number
  radius: number
  maxRadius: number
  alpha: number
  color: string
  speed: number
}

export interface Camera {
  x: number
  y: number
}

export type GamePhase = 'menu' | 'playing' | 'dead' | 'levelComplete' | 'victory'

export interface GameState {
  phase: GamePhase
  level: number
  lives: number
  coins: number
  totalCoins: number
  player: Player
  platforms: Platform[]
  enemies: Enemy[]
  coinItems: Coin[]
  exit: Exit
  waves: SoundWave[]
  camera: Camera
  playerWaveTimer: number
  deathTimer: number
  levelTimer: number
}
