/**
 * Next.js middleware for route protection
 * TODO: Implement proper auth check in Phase 1
 */

import { NextRequest, NextResponse } from 'next/server'

const publicRoutes = ['/login', '/register']
const protectedRoutes = ['/dashboard', '/workspace', '/flashcards', '/schedule', '/arena']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check if route needs protection
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  )
  
  if (isProtectedRoute) {
    // TODO: Check for valid token in cookies or localStorage
    // For now, just allow all requests - proper auth in Phase 1
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
