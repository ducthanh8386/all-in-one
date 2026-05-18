'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { initSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/authStore'
import { RoomStatePayload, useRoomStore } from '@/store/roomStore'

function useCountdown(deadline: number | null) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [])

  if (!deadline) return null
  return Math.max(0, deadline - now)
}

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
  const socket = useMemo(() => (hasHydrated ? initSocket(accessToken || undefined) : null), [accessToken, hasHydrated])

  useEffect(() => {
    if (!socket || !user || !roomId) return

    const applyState = (state: RoomStatePayload) => {
      setError('')
      setRoomState(state)
    }
    const showError = (payload: { code: string; message: string }) => {
      setError(`${payload.code}: ${payload.message}`)
    }

    socket.emit('join_room', {
      room_id: roomId,
      user_id: user.id,
      username: user.username,
    })

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

  const startGame = () => {
    socket?.emit('start_game', { room_id: roomId })
  }

  const submitDefinition = () => {
    socket?.emit('submit_definition', { room_id: roomId, text: myAnswer })
  }

  const submitVote = (definitionId: string) => {
    setVotedFor(definitionId)
    socket?.emit('submit_vote', { room_id: roomId, voted_for_user_id: definitionId })
  }

  const nextRound = () => {
    socket?.emit('next_round', { room_id: roomId })
  }

  const copyRoomCode = async () => {
    await navigator.clipboard.writeText(roomId)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[1fr_320px] lg:px-8">
        <section className="min-h-[720px]">
          <header className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <Link href="/arena" className="mb-3 inline-block text-sm text-slate-400 hover:text-white">
                Back to lobby
              </Link>
              <h1 className="text-3xl font-semibold text-white">Room {roomId}</h1>
              <p className="mt-1 text-sm text-slate-400">
                Round {Math.max(round, 1)} of {max_rounds}
              </p>
            </div>
            <button
              type="button"
              onClick={copyRoomCode}
              className="rounded-md border border-white/10 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
            >
              {copied ? 'Copied' : 'Copy room code'}
            </button>
          </header>

          {error && (
            <div className="mb-5 rounded-md border border-red-500/40 bg-red-950 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          {status === 'WAITING' && (
            <div className="flex min-h-[500px] flex-col justify-center rounded-md border border-white/10 bg-white/[0.04] p-6">
              <p className="mb-2 text-sm uppercase tracking-wide text-emerald-300">Waiting room</p>
              <h2 className="text-2xl font-semibold text-white">Players are joining</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                Start when at least two players are in the room. The host controls game start and
                next round.
              </p>
              {isHost && (
                <button
                  type="button"
                  onClick={startGame}
                  disabled={players.length < 2}
                  className="mt-6 w-full rounded-md bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 md:w-56"
                >
                  Start game
                </button>
              )}
            </div>
          )}

          {status === 'WRITING' && (
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-6">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <p className="mb-2 text-sm uppercase tracking-wide text-emerald-300">Keyword</p>
                  <h2 className="text-4xl font-semibold text-white">{keyword}</h2>
                </div>
                <div className="rounded-md border border-white/10 px-3 py-2 text-sm text-slate-200">
                  {secondsLeft ?? 0}s
                </div>
              </div>
              <textarea
                value={myAnswer}
                onChange={(event) => setMyAnswer(event.target.value)}
                placeholder="Write a convincing fake definition..."
                className="min-h-[220px] w-full rounded-md border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-emerald-400"
                maxLength={500}
              />
              <button
                type="button"
                onClick={submitDefinition}
                disabled={!myAnswer.trim()}
                className="mt-4 rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Submit definition
              </button>
            </div>
          )}

          {status === 'VOTING' && (
            <div>
              <div className="mb-5 flex items-end justify-between">
                <div>
                  <p className="mb-2 text-sm uppercase tracking-wide text-emerald-300">Vote</p>
                  <h2 className="text-2xl font-semibold text-white">Which definition is real?</h2>
                </div>
                <div className="rounded-md border border-white/10 px-3 py-2 text-sm text-slate-200">
                  {secondsLeft ?? 0}s
                </div>
              </div>
              <div className="grid gap-3">
                {definitions.map((definition) => (
                  <button
                    key={definition.id}
                    type="button"
                    onClick={() => submitVote(definition.id)}
                    disabled={Boolean(votedFor) || definition.id === meId}
                    className={`rounded-md border px-4 py-4 text-left text-sm leading-6 transition ${
                      votedFor === definition.id
                        ? 'border-emerald-400 bg-emerald-400/10 text-emerald-100'
                        : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {definition.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(status === 'RESULT' || status === 'ENDED') && (
            <div className="rounded-md border border-white/10 bg-white/[0.04] p-6">
              <p className="mb-2 text-sm uppercase tracking-wide text-emerald-300">
                {status === 'ENDED' ? 'Game over' : 'Round result'}
              </p>
              <h2 className="text-2xl font-semibold text-white">Scores updated</h2>
              <div className="mt-5 grid gap-3">
                {votes_breakdown.map((vote) => (
                  <div key={`${vote.voter_user_id}-${vote.voted_for_user_id}`} className="rounded-md border border-white/10 px-3 py-2 text-sm text-slate-300">
                    {vote.voter_user_id} voted for {vote.voted_for_user_id}
                  </div>
                ))}
              </div>
              {isHost && status !== 'ENDED' && (
                <button
                  type="button"
                  onClick={nextRound}
                  className="mt-6 rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                >
                  Next round
                </button>
              )}
            </div>
          )}
        </section>

        <aside className="rounded-md border border-white/10 bg-white/[0.04] p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Players</h2>
          <div className="grid gap-2">
            {players.map((player) => (
              <div key={player.id} className="flex items-center justify-between rounded-md bg-white/[0.04] px-3 py-2 text-sm">
                <span className={player.id === meId ? 'text-emerald-200' : 'text-slate-200'}>
                  {player.name}
                  {player.id === host_id ? ' (host)' : ''}
                </span>
                <span className="text-slate-400">{player.score}</span>
              </div>
            ))}
          </div>

          <h2 className="mb-4 mt-8 text-lg font-semibold text-white">Leaderboard</h2>
          <div className="grid gap-2">
            {(scores.length ? scores : players).map((player, index) => (
              <div key={player.id} className="flex items-center justify-between rounded-md border border-white/10 px-3 py-2 text-sm">
                <span className="text-slate-300">
                  {index + 1}. {player.name}
                </span>
                <span className="font-semibold text-white">{player.score}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  )
}
