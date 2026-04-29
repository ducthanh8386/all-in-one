/**
 * Zustand store for game room state
 * TODO: Implement in Phase 5
 */

import { create } from 'zustand'

interface Player {
  id: string
  name: string
  score: number
}

interface RoomStore {
  roomId: string | null
  players: Player[]
  status: 'WAITING' | 'WRITING' | 'VOTING' | 'RESULT' | 'ENDED'
  keyword: string | null
  definitions: { id: string; text: string }[]
  scores: { [key: string]: number }
  
  setRoomId: (id: string) => void
  setStatus: (status: RoomStore['status']) => void
  addPlayer: (player: Player) => void
  removePlayer: (id: string) => void
  setKeyword: (keyword: string) => void
  clearRoom: () => void
}

export const useRoomStore = create<RoomStore>((set) => ({
  roomId: null,
  players: [],
  status: 'WAITING',
  keyword: null,
  definitions: [],
  scores: {},
  
  setRoomId: (id) => set({ roomId: id }),
  setStatus: (status) => set({ status }),
  addPlayer: (player) =>
    set((state) => ({
      players: [...state.players, player],
    })),
  removePlayer: (id) =>
    set((state) => ({
      players: state.players.filter((p) => p.id !== id),
    })),
  setKeyword: (keyword) => set({ keyword }),
  clearRoom: () =>
    set({
      roomId: null,
      players: [],
      status: 'WAITING',
      keyword: null,
      definitions: [],
      scores: {},
    }),
}))
