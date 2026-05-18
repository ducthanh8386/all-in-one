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

import { Header } from '@/components/layout/Header'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="vi">
      <body>
        <Providers>
          <div className="min-h-screen bg-slate-50 flex flex-col">
            <Header />
            <div className="flex-1">
              {children}
            </div>
          </div>
        </Providers>
      </body>
    </html>
  )
}
