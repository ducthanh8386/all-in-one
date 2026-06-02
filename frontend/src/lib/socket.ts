/**
 * Socket.io client initialization
 * TODO: Implement socket connection in Phase 5
 */

import { io, Socket } from 'socket.io-client'

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:8000'

let socket: Socket | null = null
let socketToken: string | undefined

export const initSocket = (token?: string): Socket => {
  if (socket && socketToken === token) return socket

  if (socket) {
    socket.disconnect()
    socket = null
  }

  socketToken = token
  socket = io(SOCKET_URL, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    auth: { token: token || '' },
  })

  return socket
}

export const getSocket = (): Socket | null => socket

export const closeSocket = () => {
  if (socket) {
    socket.disconnect()
    socket = null
    socketToken = undefined
  }
}
