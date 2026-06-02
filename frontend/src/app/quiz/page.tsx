import { redirect } from 'next/navigation'

export default function QuizRedirectPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const params = new URLSearchParams()

  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item))
    } else if (value) {
      params.set(key, value)
    }
  })

  const query = params.toString()
  redirect(`/flashcards/quiz${query ? `?${query}` : ''}`)
}
