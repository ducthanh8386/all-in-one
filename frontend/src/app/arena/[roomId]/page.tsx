'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { initSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/authStore'
import { RoomStatePayload, useRoomStore } from '@/store/roomStore'

import { AppShell } from '@/components/layout/AppShell'
import { SectionCard } from '@/components/shared/SectionCard'
import { GradientButton } from '@/components/shared/GradientButton'

import { FiArrowLeft, FiCopy, FiCheck, FiClock, FiUsers, FiAlertCircle } from 'react-icons/fi'

// ─── Countdown Hook ────────────────────────────────────────────────────────────

function useCountdown(deadline: number | null) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [])
  if (!deadline) return null
  return Math.max(0, deadline - now)
}

// ─── Player Avatar ─────────────────────────────────────────────────────────────

function PlayerAvatar({ name, isMe, isHost, score }: { name: string; isMe: boolean; isHost: boolean; score: number }) {
  const initials = name.slice(0, 2).toUpperCase()
  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
      isMe ? 'border-primary bg-primary-container/10' : 'border-outline-variant/30 bg-surface-container-lowest'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
          isMe ? 'bg-primary text-on-primary' : 'bg-surface-variant text-on-surface-variant'
        }`}>
          {initials}
        </div>
        <div>
          <p className="text-sm font-semibold text-on-surface leading-tight">
            {name} {isMe && <span className="text-primary font-medium text-xs">(you)</span>}
          </p>
          {isHost && <span className="text-[10px] text-tertiary font-bold uppercase">Host</span>}
        </div>
      </div>
      <span className="text-sm font-bold text-on-surface">{score} pts</span>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ArenaRoomPage() {
  const params = useParams()
  const roomId = String(params.roomId || '').toUpperCase()
  const { user, accessToken, hasHydrated } = useAuthStore()
  const {
    status,
    host_id,
    keyword,
    round,
    max_rounds,
    deadline,
    players,
    definitions,
    scores,
    votes_breakdown,
    myAnswer,
    votedFor,
    setRoomState,
    setMyAnswer,
    setVotedFor,
    clearRoom,
  } = useRoomStore()
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const secondsLeft = useCountdown(deadline)

  const meId = user?.id || ''
  const isHost = Boolean(meId && host_id === meId)
  const socket = useMemo(
    () => (hasHydrated && user && accessToken ? initSocket(accessToken) : null),
    [accessToken, hasHydrated, user],
  )

  // ── Socket Logic ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !user || !roomId) return

    const applyState = (state: RoomStatePayload) => {
      setError('')
      setRoomState(state)
    }
    const showError = (payload: { code: string; message: string }) => {
      setError(`${payload.code}: ${payload.message}`)
    }

    socket.emit('join_room', { room_id: roomId, user_id: user.id, username: user.username })
    socket.on('game_state_sync', applyState)
    socket.on('player_joined', applyState)
    socket.on('game_started', applyState)
    socket.on('voting_phase', applyState)
    socket.on('round_result', applyState)
    socket.on('game_over', applyState)
    socket.on('game_cancelled', applyState)
    socket.on('game_error', showError)

    return () => {
      socket.off('game_state_sync', applyState)
      socket.off('player_joined', applyState)
      socket.off('game_started', applyState)
      socket.off('voting_phase', applyState)
      socket.off('round_result', applyState)
      socket.off('game_over', applyState)
      socket.off('game_cancelled', applyState)
      socket.off('game_error', showError)
      clearRoom()
    }
  }, [clearRoom, roomId, setRoomState, socket, user])

  // ── Game Actions ──────────────────────────────────────────────────────────
  const startGame = () => socket?.emit('start_game', { room_id: roomId })
  const submitDefinition = () => socket?.emit('submit_definition', { room_id: roomId, text: myAnswer })
  const submitVote = (definitionId: string) => {
    setVotedFor(definitionId)
    socket?.emit('submit_vote', { room_id: roomId, voted_for_user_id: definitionId })
  }
  const nextRound = () => socket?.emit('next_round', { room_id: roomId })

  const copyRoomCode = async () => {
    await navigator.clipboard.writeText(roomId)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const timerPercent = deadline && secondsLeft != null 
    ? Math.max(0, (secondsLeft / 60) * 100)
    : 0

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
        
        {/* Main Game Area */}
        <div className="flex flex-col gap-6">
          
          {/* Room Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/arena" className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary-container/20 rounded-lg transition-colors">
                <FiArrowLeft className="text-xl" />
              </Link>
              <div>
                <h1 className="text-xl font-heading font-bold text-on-surface flex items-center gap-3">
                  Room <span className="font-mono text-primary bg-primary-container/20 px-3 py-0.5 rounded-lg border border-primary/20">{roomId}</span>
                </h1>
                <p className="text-sm text-on-surface-variant mt-0.5">
                  Round {Math.max(round, 1)} of {max_rounds}
                </p>
              </div>
            </div>
            <button
              onClick={copyRoomCode}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-outline-variant/50 bg-surface-container-lowest text-on-surface-variant hover:text-on-surface hover:border-outline-variant transition-colors text-sm font-medium"
            >
              {copied ? <><FiCheck className="text-success" /> Copied!</> : <><FiCopy /> Copy Code</>}
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="flex items-center gap-3 p-4 bg-error-container/20 border border-error/30 rounded-xl text-error text-sm font-medium">
              <FiAlertCircle className="shrink-0" /> {error}
            </div>
          )}

          {/* WAITING */}
          {status === 'WAITING' && (
            <SectionCard className="p-8 flex flex-col items-center text-center min-h-[400px] justify-center border-primary/10">
              <div className="w-20 h-20 rounded-full bg-primary-container/30 text-primary flex items-center justify-center text-4xl mb-6 animate-pulse">
                <FiUsers />
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-variant text-on-surface-variant text-xs font-bold uppercase tracking-wider mb-4">
                Waiting Room
              </div>
              <h2 className="text-3xl font-heading font-bold text-on-surface mb-3">Players are joining...</h2>
              <p className="text-on-surface-variant max-w-sm mb-8">
                Share the room code with friends. The host controls when the game starts. Minimum 2 players required.
              </p>
              {isHost && (
                <GradientButton
                  size="lg"
                  onClick={startGame}
                  disabled={players.length < 2}
                  className="min-w-[200px] justify-center"
                >
                  {players.length < 2 ? `Waiting for players (${players.length}/2)` : 'Start Game'}
                </GradientButton>
              )}
              {!isHost && (
                <p className="text-sm text-on-surface-variant">Waiting for the host to start the game...</p>
              )}
            </SectionCard>
          )}

          {/* WRITING */}
          {status === 'WRITING' && (
            <SectionCard className="p-8 border-primary/20 shadow-lg">
              {/* Timer */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <span className="text-xs font-bold uppercase tracking-widest text-primary mb-2 block">Round Keyword</span>
                  <h2 className="text-4xl md:text-5xl font-heading font-bold text-on-surface">{keyword}</h2>
                </div>
                <div className={`flex flex-col items-center justify-center w-16 h-16 rounded-full border-4 font-bold text-xl transition-colors ${
                  (secondsLeft ?? 60) <= 10 ? 'border-error text-error' : 'border-primary text-primary'
                }`}>
                  {secondsLeft ?? 0}
                </div>
              </div>

              {/* Progress bar for timer */}
              <div className="w-full h-1.5 bg-surface-variant rounded-full mb-6 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${(secondsLeft ?? 60) <= 10 ? 'bg-error' : 'bg-primary'}`}
                  style={{ width: `${timerPercent}%` }}
                />
              </div>

              <textarea
                value={myAnswer}
                onChange={(e) => setMyAnswer(e.target.value)}
                placeholder="Write a convincing fake definition..."
                className="w-full min-h-[180px] px-4 py-3 bg-surface-container-lowest border border-outline-variant/50 rounded-xl text-on-surface text-base focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all resize-none"
                maxLength={500}
              />
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-on-surface-variant">{myAnswer.length}/500 characters</span>
                <GradientButton onClick={submitDefinition} disabled={!myAnswer.trim()}>
                  Submit Definition
                </GradientButton>
              </div>
            </SectionCard>
          )}

          {/* VOTING */}
          {status === 'VOTING' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-heading font-bold text-on-surface">Which definition is real?</h2>
                  <p className="text-sm text-on-surface-variant mt-1">Vote for the correct definition. You cannot vote for your own.</p>
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-bold text-sm ${
                  (secondsLeft ?? 60) <= 10 ? 'border-error text-error bg-error-container/10' : 'border-primary text-primary bg-primary-container/10'
                }`}>
                  <FiClock /> {secondsLeft ?? 0}s
                </div>
              </div>

              <div className="grid gap-3">
                {definitions.map((definition) => {
                  const isVotedFor = votedFor === definition.id
                  const isOwnDefinition = definition.id === meId
                  return (
                    <button
                      key={definition.id}
                      type="button"
                      onClick={() => submitVote(definition.id)}
                      disabled={Boolean(votedFor) || isOwnDefinition}
                      className={`p-5 rounded-2xl border-2 text-left leading-relaxed transition-all duration-200 ${
                        isVotedFor
                          ? 'border-primary bg-primary-container/10 text-on-surface shadow-sm'
                          : isOwnDefinition
                          ? 'border-outline-variant/10 bg-surface-container-low opacity-40 cursor-not-allowed'
                          : 'border-outline-variant/30 bg-surface-container-lowest hover:border-primary/50 hover:bg-surface-container-low text-on-surface'
                      } disabled:cursor-not-allowed`}
                    >
                      {definition.text}
                    </button>
                  )
                })}
              </div>
              {votedFor && <p className="text-sm text-center text-success font-medium">Vote submitted! Waiting for others...</p>}
            </div>
          )}

          {/* RESULT & ENDED */}
          {(status === 'RESULT' || status === 'ENDED') && (
            <SectionCard className="p-8">
              <div className="mb-6">
                <span className="text-xs font-bold uppercase tracking-widest text-primary mb-2 block">
                  {status === 'ENDED' ? 'Game Over' : 'Round Result'}
                </span>
                <h2 className="text-3xl font-heading font-bold text-on-surface">
                  {status === 'ENDED' ? '🏆 Final Scores' : 'Scores Updated'}
                </h2>
              </div>

              {votes_breakdown.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-sm font-semibold text-on-surface-variant mb-3 uppercase tracking-wider">Votes Breakdown</h3>
                  <div className="grid gap-2">
                    {votes_breakdown.map((vote) => (
                      <div key={`${vote.voter_user_id}-${vote.voted_for_user_id}`} className="flex items-center gap-3 px-4 py-2 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-sm text-on-surface-variant">
                        <span className="font-medium text-on-surface">{vote.voter_user_id}</span>
                        <span className="text-outline">voted for</span>
                        <span className="font-medium text-on-surface">{vote.voted_for_user_id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3 mt-6">
                {isHost && status !== 'ENDED' && (
                  <GradientButton onClick={nextRound}>
                    Next Round →
                  </GradientButton>
                )}
                {status === 'ENDED' && (
                  <Link href="/arena">
                    <GradientButton variant="secondary">Back to Lobby</GradientButton>
                  </Link>
                )}
              </div>
            </SectionCard>
          )}
        </div>

        {/* Right Sidebar — Players & Leaderboard */}
        <div className="flex flex-col gap-6">
          <SectionCard className="p-5">
            <h3 className="font-heading font-bold text-on-surface mb-4 flex items-center gap-2">
              <FiUsers className="text-primary" /> Players ({players.length})
            </h3>
            <div className="flex flex-col gap-2">
              {players.map((player) => (
                <PlayerAvatar
                  key={player.id}
                  name={player.name}
                  isMe={player.id === meId}
                  isHost={player.id === host_id}
                  score={player.score}
                />
              ))}
            </div>
          </SectionCard>

          {(scores.length > 0 || status === 'RESULT' || status === 'ENDED') && (
            <SectionCard className="p-5">
              <h3 className="font-heading font-bold text-on-surface mb-4">🏅 Leaderboard</h3>
              <div className="flex flex-col gap-2">
                {(scores.length ? scores : players).map((player, index) => (
                  <div key={player.id} className={`flex items-center justify-between p-3 rounded-xl border ${
                    index === 0 ? 'border-tertiary/30 bg-tertiary-container/10' : 'border-outline-variant/30 bg-surface-container-lowest'
                  }`}>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold ${index === 0 ? 'text-tertiary' : 'text-on-surface-variant'}`}>
                        #{index + 1}
                      </span>
                      <span className="text-sm font-semibold text-on-surface">{player.name}</span>
                    </div>
                    <span className="font-bold text-on-surface">{player.score}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </AppShell>
  )
}
