/**
 * Main layout with global styles
 */

import './globals.css'
import type { Metadata } from 'next'
import { Providers } from '@/app/providers'

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
    <html lang="vi">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
