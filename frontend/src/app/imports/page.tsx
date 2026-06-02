'use client'

import { useRef, useState } from 'react'
import apiClient, { getApiErrorMessage } from '@/lib/axios'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { GradientButton } from '@/components/shared/GradientButton'
import { EmptyState } from '@/components/shared/EmptyState'
import { ImportPreview } from '@/types/examPlanner'
import { FiCheckCircle, FiUploadCloud } from 'react-icons/fi'

export default function ImportsPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [importType, setImportType] = useState<'flashcards' | 'questions'>('flashcards')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const upload = async (file: File) => {
    setLoading(true)
    setMessage('')
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await apiClient.post<ImportPreview>(`/api/v1/imports/${importType}/preview`, form)
      setPreview(res.data)
    } catch (err) {
      setMessage(getApiErrorMessage(err, 'Preview import thất bại.'))
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const commit = async () => {
    if (!preview) return
    setLoading(true)
    try {
      const rows = preview.rows.filter(row => row.errors.length === 0).map(row => row.data)
      const res = await apiClient.post(`/api/v1/imports/${importType}/commit`, { rows })
      setMessage(`Đã import ${res.data.created} dòng, bỏ qua ${res.data.skipped}.`)
      setPreview(null)
    } catch (err) {
      setMessage(getApiErrorMessage(err, 'Commit import thất bại.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell>
      <PageHeader title="Import Bank" subtitle="Preview CSV/XLSX trước khi commit flashcards hoặc question bank." />
      {message && <div className="mb-4 rounded-lg bg-surface-variant px-4 py-3 text-sm font-semibold">{message}</div>}
      <SectionCard className="p-6">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex rounded-lg border border-outline-variant/40 p-1">
            {(['flashcards', 'questions'] as const).map(type => (
              <button key={type} onClick={() => setImportType(type)} className={`rounded-md px-4 py-2 text-sm font-bold ${importType === type ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>{type}</button>
            ))}
          </div>
          <div className="flex gap-3">
            <input ref={inputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
            <GradientButton disabled={loading} onClick={() => inputRef.current?.click()}><FiUploadCloud className="mr-2" /> Upload CSV/XLSX</GradientButton>
            <button disabled={!preview || loading || preview.valid_count === 0} onClick={commit} className="rounded-lg border border-outline-variant/50 px-4 py-2 text-sm font-bold disabled:opacity-50"><FiCheckCircle className="mr-1 inline" /> Commit valid rows</button>
          </div>
        </div>
        {!preview ? (
          <EmptyState icon={FiUploadCloud} title="No preview yet" description="Flashcard columns: subject_id, chapter_id, front, back, tag. Question columns: subject_id, chapter_id, question_text, options, correct_answer, explanation, difficulty." />
        ) : (
          <div>
            <div className="mb-4 grid grid-cols-2 gap-3 md:w-96">
              <div className="rounded-lg bg-success-container/30 p-3"><p className="text-xs">Valid</p><p className="text-2xl font-bold">{preview.valid_count}</p></div>
              <div className="rounded-lg bg-error-container/30 p-3"><p className="text-xs">Invalid</p><p className="text-2xl font-bold">{preview.invalid_count}</p></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-outline-variant/30 text-on-surface-variant"><tr><th className="py-3">Row</th><th>Data</th><th>Errors</th></tr></thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {preview.rows.map(row => (
                    <tr key={row.row}>
                      <td className="py-3 font-bold">{row.row}</td>
                      <td className="max-w-xl truncate text-on-surface-variant">{JSON.stringify(row.data)}</td>
                      <td className={row.errors.length ? 'text-error' : 'text-success'}>{row.errors.map(e => `${e.field || 'row'}: ${e.message}`).join('; ') || 'OK'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SectionCard>
    </AppShell>
  )
}
