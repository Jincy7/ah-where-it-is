import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse } from 'next/server'

/**
 * Middleware for authentication and route protection.
 *
 * Protected routes (require authentication):
 * - / (home)
 * - /container/*
 * - /settings
 * - /print/*
 *
 * Public routes:
 * - /login
 * - /signup
 * - /_next/* (Next.js internals)
 * - /favicon.ico
 * - /api/* (API routes)
 *
 * Authentication flow:
 * - Unauthenticated users accessing protected routes → redirect to /login
 * - Authenticated users accessing /login or /signup → redirect to /
 */
export async function middleware(request: NextRequest) {
  const { user, response } = await updateSession(request)

  const { pathname } = request.nextUrl

  // Define protected routes that require authentication
  const protectedRoutes = [
    '/',
    '/container',
    '/settings',
    '/print',
  ]

  // Check if the current path matches a protected route
  const isProtectedRoute = protectedRoutes.some((route) => {
    if (route === '/') {
      return pathname === '/'
    }
    return pathname.startsWith(route)
  })

  // If user is not authenticated and trying to access a protected route
  if (!user && isProtectedRoute) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    // Add redirect parameter to return user after login
    redirectUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // If user is authenticated and trying to access login or signup page, redirect to home
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/'
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
