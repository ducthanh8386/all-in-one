/**
 * Home page / Redirect to dashboard
 */

import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/dashboard')
}
