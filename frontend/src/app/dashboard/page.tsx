/**
 * Dashboard page
 * TODO: Implement in Phase 1
 */

'use client'

import { useAuthStore } from '@/store/authStore'

export default function DashboardPage() {
  const { user } = useAuthStore()

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Dashboard</h1>
        {user && <p className="text-gray-600 mb-8">Xin chào, {user.username}!</p>}
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-lg shadow">
            <p className="text-gray-500 text-sm">TODO: Implement Phase 0</p>
          </div>
        </div>
      </div>
    </main>
  )
}
