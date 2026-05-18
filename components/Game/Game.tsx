'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import type { GameState, GamePhase } from './types'
import { buildInitialState, stepGame } from './gameLogic'
import { render } from './renderer'
import styles from './Game.module.css'

const CANVAS_W = 800
const CANVAS_H = 560
const INITIAL_LIVES = 3

export default function Game() {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const stateRef    = useRef<GameState>(buildInitialState(0, INITIAL_LIVES))
  const keysRef     = useRef<Set<string>>(new Set())
  const rafRef      = useRef<number>(0)
  const [phase, setPhase]     = useState<GamePhase>('menu')
  const [level, setLevel]     = useState(0)
  const [lives, setLives]     = useState(INITIAL_LIVES)
  const [uiCoins, setUiCoins] = useState(0)

  const startLevel = useCallback((lvl: number, lv: number) => {
    stateRef.current = buildInitialState(lvl, lv)
    setPhase('playing')
    setLevel(lvl)
    setLives(lv)
    setUiCoins(0)
  }, [])

  const startGame = useCallback(() => {
    startLevel(0, INITIAL_LIVES)
  }, [startLevel])

  // Game loop
  useEffect(() => {
    if (phase !== 'playing') return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let running = true

    const loop = () => {
      if (!running) return

      stateRef.current = stepGame(
        stateRef.current,
        keysRef.current,
        CANVAS_W,
        CANVAS_H,
      )

      const s = stateRef.current

      render(ctx, s, CANVAS_W, CANVAS_H)

      if (s.phase !== 'playing') {
        setPhase(s.phase)
        setLives(s.lives)
        setUiCoins(s.coins)
        setLevel(s.level)
        return
      }

      setUiCoins(s.coins)
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      running = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [phase])

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current.add(e.code)
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.code)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Level-complete auto-advance
  useEffect(() => {
    if (phase === 'levelComplete') {
      const t = setTimeout(() => startLevel(level + 1, lives), 2200)
      return () => clearTimeout(t)
    }
  }, [phase, level, lives, startLevel])

  return (
    <div className={styles.wrapper}>
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className={styles.canvas}
      />

      {phase === 'menu' && (
        <Overlay>
          <h1 className={styles.title}>ECHORUNNER</h1>
          <p className={styles.subtitle}>Tu es aveugle.<br />Écoute les ondes.</p>
          <div className={styles.controls}>
            <span>← → / A D — Déplacer</span>
            <span>↑ / W / Espace — Sauter</span>
            <span>Sauter sur les ennemis pour les éliminer</span>
          </div>
          <button onClick={startGame}>COMMENCER</button>
        </Overlay>
      )}

      {phase === 'levelComplete' && (
        <Overlay>
          <h2 className={styles.title}>NIVEAU TERMINÉ</h2>
          <p className={styles.subtitle}>
            Pièces : {uiCoins} / {stateRef.current.totalCoins}
          </p>
          <p className={styles.dim}>Niveau suivant dans un instant…</p>
        </Overlay>
      )}

      {phase === 'dead' && (
        <Overlay>
          <h2 className={styles.title}>GAME OVER</h2>
          <p className={styles.dim}>Le silence a eu raison de toi.</p>
          <button onClick={startGame}>RECOMMENCER</button>
        </Overlay>
      )}

      {phase === 'victory' && (
        <Overlay>
          <h2 className={styles.title}>VICTOIRE</h2>
          <p className={styles.subtitle}>
            Tu as traversé l&apos;obscurité.<br />
            Pièces : {uiCoins} / {stateRef.current.totalCoins}
          </p>
          <button onClick={startGame}>REJOUER</button>
        </Overlay>
      )}

      {/* Mobile controls */}
      <MobileControls keysRef={keysRef} />
    </div>
  )
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.overlayInner}>{children}</div>
    </div>
  )
}

function MobileControls({ keysRef }: { keysRef: React.MutableRefObject<Set<string>> }) {
  const press = (code: string) => keysRef.current.add(code)
  const release = (code: string) => keysRef.current.delete(code)

  return (
    <div className={styles.mobileControls}>
      <button
        className={styles.dpad}
        onPointerDown={() => press('ArrowLeft')}
        onPointerUp={() => release('ArrowLeft')}
        onPointerLeave={() => release('ArrowLeft')}
      >◀</button>
      <button
        className={`${styles.dpad} ${styles.jumpBtn}`}
        onPointerDown={() => press('Space')}
        onPointerUp={() => release('Space')}
        onPointerLeave={() => release('Space')}
      >▲</button>
      <button
        className={styles.dpad}
        onPointerDown={() => press('ArrowRight')}
        onPointerUp={() => release('ArrowRight')}
        onPointerLeave={() => release('ArrowRight')}
      >▶</button>
    </div>
  )
}
