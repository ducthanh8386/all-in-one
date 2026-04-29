/**
 * Note and document types
 */

export interface Document {
  id: number
  user_id: string
  title: string
  file_path?: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  vector_collection_name?: string
  error_message?: string
  created_at: string
}
