/**
 * User types
 */

export interface User {
  id: string
  username: string
  email: string
  role: 'USER' | 'MODERATOR' | 'ADMIN'
  ai_quota: number
  is_active: boolean
  created_at: string
}
