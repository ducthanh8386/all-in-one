export interface Subject {
  id: number
  name: string
  code?: string | null
  teacher_name?: string | null
  exam_date?: string | null
  target_score?: number | null
  color: string
  description?: string | null
  chapter_count: number
  flashcard_count: number
  question_count: number
}

export interface Chapter {
  id: number
  subject_id: number
  title: string
  description?: string | null
  order_index: number
  flashcard_count: number
  question_count: number
}

export interface Question {
  id: number
  subject_id: number
  chapter_id?: number | null
  question_text: string
  question_type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER'
  options: string[]
  correct_answer: string
  explanation?: string | null
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
}

export interface DashboardAnalytics {
  due_flashcards: number
  exam_countdown: Array<{ subject_id: number; name: string; exam_date: string; days_left: number }>
  current_streak: number
  longest_streak: number
  weak_chapters: Array<{ subject_id: number; chapter_id: number; chapter_title: string; accuracy: number }>
  mistake_count: number
  study_time_this_week: number
  goal_progress: Array<{ id: number; title: string; subject_id: number; progress: number; deadline?: string | null }>
  recommendations: string[]
  subject_accuracy: Array<{ subject_id: number; accuracy: number }>
}

export interface ImportPreviewRow {
  row: number
  data: Record<string, string>
  errors: Array<{ row: number; field?: string | null; message: string }>
}

export interface ImportPreview {
  import_type: string
  valid_count: number
  invalid_count: number
  rows: ImportPreviewRow[]
}
