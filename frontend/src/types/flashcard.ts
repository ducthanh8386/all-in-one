/**
 * Flashcard types
 */

export interface Flashcard {
  id: number
  doc_id: number | null
  user_id: string
  front_text: string
  back_text: string
  tag?: string | null
  repetition_count: number
  ease_factor: number
  interval_days: number
  next_review_date: string
}
