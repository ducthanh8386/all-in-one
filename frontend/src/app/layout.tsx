/**
 * Main layout with global styles
 */

import './globals.css'
import type { Metadata } from 'next'
import { Providers } from '@/app/providers'
import { Inter, Hanken_Grotesk } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-hanken-grotesk',
})

export const metadata: Metadata = {
  title: 'Brain-Sync - All-in-one Study Workspace',
  description: 'Manage your study, flashcards, schedule, and compete in real-time games',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${hankenGrotesk.variable}`}>
      <body className="min-h-screen bg-background text-on-background font-sans antialiased flex flex-col">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
