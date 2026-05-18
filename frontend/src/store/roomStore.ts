import { create } from 'zustand'

export type RoomStatus = 'WAITING' | 'WRITING' | 'VOTING' | 'RESULT' | 'ENDED'

export interface Player {
  id: string
  name: string
  score: number
}

export interface Definition {
  id: string
  text: string
}

export interface VoteBreakdown {
  voter_user_id: string
  voted_for_user_id: string
}

export interface RoomStatePayload {
  room_id: string
  status: RoomStatus
  host_id: string
  keyword: string
  round: number
  max_rounds: number
  deadline: number | null
  players: Player[]
  definitions: Definition[]
  scores: Player[]
  votes_breakdown: VoteBreakdown[]
  correct_answer_owner: string
}

interface RoomStore extends RoomStatePayload {
  myAnswer: string
  votedFor: string | null
  setRoomState: (state: RoomStatePayload) => void
  setMyAnswer: (answer: string) => void
  setVotedFor: (definitionId: string | null) => void
  clearRoom: () => void
}

const emptyState: RoomStatePayload = {
  room_id: '',
  status: 'WAITING',
  host_id: '',
  keyword: '',
  round: 0,
  max_rounds: 3,
  deadline: null,
  players: [],
  definitions: [],
  scores: [],
  votes_breakdown: [],
  correct_answer_owner: 'AI_BOT',
}

export const useRoomStore = create<RoomStore>((set) => ({
  ...emptyState,
  myAnswer: '',
  votedFor: null,
  setRoomState: (state) =>
    set((current) => ({
      ...state,
      myAnswer: state.status === 'WRITING' ? current.myAnswer : '',
      votedFor: state.status === 'VOTING' ? current.votedFor : null,
    })),
  setMyAnswer: (answer) => set({ myAnswer: answer }),
  setVotedFor: (definitionId) => set({ votedFor: definitionId }),
  clearRoom: () => set({ ...emptyState, myAnswer: '', votedFor: null }),
}))
