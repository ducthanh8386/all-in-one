import { NextRequest, NextResponse } from 'next/server'

/**
 * IMPORTANT: Middleware does NOT check authentication
 * Why? Because refresh_token proves you have a past login,
 * but NOT that your access_token is valid.
 * 
 * Client-side protection via useEffect + /auth/me is the correct approach
 * for dual-token JWT architecture.
 */

export function middleware(request: NextRequest) {
  // Just pass through - let client handle auth verification
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
