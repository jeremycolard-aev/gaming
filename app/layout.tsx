import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'EchoRunner — Le jeu de l\'aveugle',
  description: 'Platformer où votre personnage est aveugle. Naviguez dans l\'obscurité grâce aux ondes sonores.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
