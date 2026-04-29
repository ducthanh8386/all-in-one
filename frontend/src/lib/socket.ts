/**
 * Socket.io client initialization
 * TODO: Implement socket connection in Phase 5
 */

import { io, Socket } from 'socket.io-client'

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:8000'

let socket: Socket | null = null

export const initSocket = (): Socket => {
  if (socket) return socket

  socket = io(SOCKET_URL, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  })

  return socket
}

export const getSocket = (): Socket | null => socket

export const closeSocket = () => {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
