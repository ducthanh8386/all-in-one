'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { initSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/authStore'

interface PublicRoom {
  room_id: string
  status: string
  players_count: number
  round: number
  max_rounds: number
}

function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

export default function ArenaPage() {
  const router = useRouter()
  const { accessToken, hasHydrated } = useAuthStore()
  const [roomCode, setRoomCode] = useState('')
  const [rooms, setRooms] = useState<PublicRoom[]>([])
  const suggestedCode = useMemo(() => makeRoomCode(), [])

  useEffect(() => {
    if (!hasHydrated) return
    const socket = initSocket(accessToken || undefined)
    const handleRooms = (payload: PublicRoom[]) => setRooms(payload)
    socket.on('rooms_list', handleRooms)
    socket.emit('list_rooms')
    return () => {
      socket.off('rooms_list', handleRooms)
    }
  }, [accessToken, hasHydrated])

  const joinRoom = (event: FormEvent) => {
    event.preventDefault()
    const code = roomCode.trim().toUpperCase()
    if (code) {
      router.push(`/arena/${code}`)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-10">
        <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <section>
            <p className="mb-3 text-sm font-medium uppercase tracking-wide text-emerald-300">
              Concept Association
            </p>
            <h1 className="text-4xl font-semibold tracking-normal text-white md:text-5xl">
              Arena
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
              Join a study room, write convincing fake definitions, vote on the real one, and climb
              the leaderboard across three rounds.
            </p>
          </section>

          <section className="rounded-md border border-white/10 bg-white/[0.04] p-5">
            <div className="grid gap-4">
              <button
                type="button"
                onClick={() => router.push(`/arena/${suggestedCode}`)}
                className="rounded-md bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
              >
                Create room {suggestedCode}
              </button>

              <div className="h-px bg-white/10" />

              <form onSubmit={joinRoom} className="grid gap-3">
                <label className="grid gap-1.5 text-sm">
                  <span className="text-slate-300">Room code</span>
                  <input
                    value={roomCode}
                    onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                    placeholder="ABC123"
                    className="rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-white outline-none focus:border-emerald-400"
                    maxLength={12}
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-md border border-emerald-400/40 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/10"
                >
                  Join room
                </button>
              </form>
            </div>
          </section>
        </div>

        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Public rooms</h2>
            <span className="text-sm text-slate-500">{rooms.length} active</span>
          </div>
          {rooms.length === 0 ? (
            <div className="rounded-md border border-white/10 bg-white/[0.04] px-4 py-8 text-center text-sm text-slate-400">
              No active rooms yet.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {rooms.map((room) => (
                <button
                  key={room.room_id}
                  type="button"
                  onClick={() => router.push(`/arena/${room.room_id}`)}
                  className="rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:bg-white/[0.08]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-white">{room.room_id}</span>
                    <span className="text-xs uppercase tracking-wide text-emerald-300">
                      {room.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">
                    {room.players_count} players · Round {room.round || 1}/{room.max_rounds}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
