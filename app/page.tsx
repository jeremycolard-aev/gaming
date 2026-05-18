'use client'

import dynamic from 'next/dynamic'
import styles from './page.module.css'

const Game = dynamic(() => import('@/components/Game/Game'), { ssr: false })

export default function HomePage() {
  return (
    <main className={styles.main}>
      <Game />
    </main>
  )
}
