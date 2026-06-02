'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { initSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/authStore'

import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { GradientButton } from '@/components/shared/GradientButton'
import { EmptyState } from '@/components/shared/EmptyState'

import { FiZap, FiUsers, FiArrowRight } from 'react-icons/fi'

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
  const { user, accessToken, hasHydrated } = useAuthStore()
  const [roomCode, setRoomCode] = useState('')
  const [rooms, setRooms] = useState<PublicRoom[]>([])
  const [joinError, setJoinError] = useState('')
  const suggestedCode = useMemo(() => makeRoomCode(), [])

  useEffect(() => {
    if (!hasHydrated || !user || !accessToken) return
    const socket = initSocket(accessToken)
    const handleRooms = (payload: PublicRoom[]) => setRooms(payload)
    socket.on('rooms_list', handleRooms)
    socket.emit('list_rooms')
    return () => {
      socket.off('rooms_list', handleRooms)
    }
  }, [accessToken, hasHydrated, user])

  const joinRoom = (event: FormEvent) => {
    event.preventDefault()
    const code = roomCode.trim().toUpperCase()
    if (!code) {
      setJoinError('Please enter a room code.')
      return
    }
    setJoinError('')
    router.push(`/arena/${code}`)
  }

  return (
    <AppShell>
      <PageHeader
        title="Arena"
        subtitle="Practice concepts with friends in real time."
        actions={
          <span className="px-3 py-1 rounded-full bg-tertiary-container/30 text-tertiary text-xs font-bold uppercase tracking-wider border border-tertiary/20">
            Beta
          </span>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-4">

        {/* Left — Create + Join */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* Create Room */}
          <SectionCard className="p-8 bg-gradient-to-br from-primary-container/20 to-surface-container-low border-primary/20 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 blur-3xl rounded-full -translate-y-1/4 translate-x-1/4 pointer-events-none" />
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-xl bg-primary-container/50 text-primary flex items-center justify-center mb-4">
                <FiZap className="text-2xl" />
              </div>
              <h2 className="text-2xl font-heading font-bold text-on-surface mb-2">Create a Room</h2>
              <p className="text-on-surface-variant mb-6 max-w-sm">
                Start a new Concept Association room. Your friends join using the room code.
              </p>
              <GradientButton size="lg" onClick={() => router.push(`/arena/${suggestedCode}`)}>
                Create Room <span className="ml-2 font-mono bg-white/20 px-2 py-0.5 rounded text-sm">{suggestedCode}</span>
              </GradientButton>
            </div>
          </SectionCard>

          {/* Join Room */}
          <SectionCard className="p-8">
            <h2 className="text-xl font-heading font-bold text-on-surface mb-6">Join a Room</h2>
            <form onSubmit={joinRoom} className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="flex-1 w-full">
                <input
                  value={roomCode}
                  onChange={(e) => { setRoomCode(e.target.value.toUpperCase()); setJoinError('') }}
                  placeholder="Enter room code e.g. ABC123"
                  className="w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant/50 rounded-xl text-on-surface font-mono tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                  maxLength={12}
                />
                {joinError && <p className="text-error text-sm mt-2">{joinError}</p>}
              </div>
              <GradientButton type="submit" size="lg" className="shrink-0 w-full sm:w-auto">
                Join <FiArrowRight className="ml-2" />
              </GradientButton>
            </form>
          </SectionCard>

          {/* Public Rooms */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-heading font-bold text-on-surface">Public Rooms</h2>
              <span className="text-sm text-on-surface-variant">{rooms.length} active</span>
            </div>

            {rooms.length === 0 ? (
              <EmptyState
                icon={FiUsers}
                title="No active rooms"
                description="Be the first to start a session. Your friends can join using the room code."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rooms.map((room) => (
                  <SectionCard
                    key={room.room_id}
                    className="p-5 cursor-pointer hover:border-primary/50 hover:bg-surface-variant/30 transition-all"
                    onClick={() => router.push(`/arena/${room.room_id}`)}
                  >
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <span className="font-mono font-bold text-lg text-on-surface">{room.room_id}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        room.status === 'WAITING' ? 'bg-success/10 text-success' : 'bg-primary-container/30 text-primary'
                      }`}>
                        {room.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-on-surface-variant">
                      <span className="flex items-center gap-1"><FiUsers /> {room.players_count} players</span>
                      <span>Round {room.round || 1}/{room.max_rounds}</span>
                    </div>
                  </SectionCard>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right — Rules */}
        <div>
          <SectionCard className="p-6 sticky top-8">
            <h3 className="font-heading font-bold text-on-surface mb-4 flex items-center gap-2">
              <FiZap className="text-primary" /> How to Play
            </h3>
            <div className="space-y-4">
              {[
                { step: '1', title: 'Join a Room', desc: '2–8 players join with a shared room code.' },
                { step: '2', title: 'Write a Definition', desc: 'A keyword appears. Write a convincing fake definition before the timer runs out.' },
                { step: '3', title: 'Vote for the Real One', desc: 'All definitions are shown anonymously. Vote for what you believe is the correct one.' },
                { step: '4', title: 'Score Points', desc: 'Fool others with your fake definition, or spot the real one to earn points.' },
              ].map(rule => (
                <div key={rule.step} className="flex gap-4">
                  <div className="w-7 h-7 rounded-full bg-primary-container/30 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {rule.step}
                  </div>
                  <div>
                    <p className="font-semibold text-on-surface text-sm">{rule.title}</p>
                    <p className="text-xs text-on-surface-variant leading-relaxed mt-0.5">{rule.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

      </div>
    </AppShell>
  )
}
