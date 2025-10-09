# Authentication Flow Reference

Quick reference for understanding the authentication system.

## Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     User Access Flow                         │
└─────────────────────────────────────────────────────────────┘

1. User visits protected page (e.g., /)
   │
   ├─> Middleware runs (middleware.ts)
   │   │
   │   ├─> User authenticated?
   │   │   │
   │   │   ├─> YES: Allow access, update session
   │   │   │         │
   │   │   │         └─> Page component loads
   │   │   │             │
   │   │   │             └─> Server-side auth check (redundant)
   │   │   │                 │
   │   │   │                 └─> Render page with Navbar
   │   │   │
   │   │   └─> NO: Redirect to /login?redirectTo=original-path
   │   │
   │   └─> At /login
   │       │
   │       ├─> User authenticated?
   │       │   │
   │       │   ├─> YES: Redirect to /
   │       │   │
   │       │   └─> NO: Show login form
   │       │
   │       └─> User submits form
   │           │
   │           └─> supabase.auth.signInWithPassword()
   │               │
   │               ├─> Success: Redirect to / (or redirectTo param)
   │               │
   │               └─> Error: Show toast error message

2. User clicks logout
   │
   └─> UserMenu component
       │
       └─> supabase.auth.signOut()
           │
           ├─> Success: Redirect to /login
           │
           └─> Error: Show toast error message
```

## Code Patterns

### 1. Server Component Auth Check

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ProtectedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <div>Protected content for {user.email}</div>
}
```

### 2. Client Component Auth Action

```tsx
'use client'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export function AuthComponent() {
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      toast.error(error.message)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      toast.error(error.message)
    } else {
      router.push('/login')
      router.refresh()
    }
  }

  return <div>...</div>
}
```

## Protected Routes Configuration

Defined in `/middleware.ts`:

```typescript
const protectedRoutes = [
  '/',           // Home page
  '/container',  // All container routes
  '/settings',   // Settings page
  '/print',      // Print routes
]
```

## Public Routes

- `/login` - Login page
- `/_next/*` - Next.js internals
- `/favicon.ico` - Favicon
- `/api/*` - API routes
- Static files (images, etc.)

## Security Layers

1. **Middleware** (first line of defense)
   - Runs before page load
   - Redirects unauthenticated users
   - Updates session tokens

2. **Page-level checks** (second line)
   - Server components check auth
   - Redundant but adds security
   - Prevents unauthorized content flash

3. **API routes** (future)
   - Will use server-side Supabase client
   - Verify auth on every request

## Session Management

- Supabase handles session tokens via cookies
- Middleware uses `updateSession()` to refresh tokens
- Server components use `getUser()` to verify current session
- Client components use browser storage (managed by Supabase)

## Important Notes

### Why Two Supabase Clients?

- **Server client** (`@/lib/supabase/server`):
  - Uses Next.js cookies API
  - For Server Components and API routes
  - Cannot be used in Client Components

- **Client client** (`@/lib/supabase/client`):
  - Uses browser storage
  - For Client Components only
  - Used for interactive auth actions

### When to Use Each?

```
Server Component (async function)
  → Use: import { createClient } from '@/lib/supabase/server'
  → Example: await createClient()

Client Component ('use client')
  → Use: import { createClient } from '@/lib/supabase/client'
  → Example: createClient()
```

## Common Patterns

### Conditional Rendering Based on Auth

```tsx
// Server Component
export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div>
      {user ? (
        <p>Welcome {user.email}</p>
      ) : (
        <p>Please log in</p>
      )}
    </div>
  )
}
```

### Passing User Data to Client Components

```tsx
// Server Component
export default async function Layout() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div>
      <ClientComponent userEmail={user?.email || ''} />
    </div>
  )
}

// Client Component
'use client'
export function ClientComponent({ userEmail }: { userEmail: string }) {
  return <div>{userEmail}</div>
}
```

## Error Handling

Always handle auth errors:

```tsx
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password,
})

if (error) {
  // Show error to user
  toast.error(error.message)
  return
}

// Success - proceed
router.push('/')
```

## Testing Checklist

- [ ] Unauthenticated user visits / → redirects to /login
- [ ] User logs in with valid credentials → redirects to /
- [ ] User logs in with invalid credentials → shows error
- [ ] Authenticated user visits /login → redirects to /
- [ ] User logs out → redirects to /login
- [ ] Middleware redirects preserve ?redirectTo parameter
- [ ] Session persists across page refreshes
- [ ] Session expires after timeout (Supabase default: 1 hour)

## Troubleshooting

### Issue: Infinite redirect loop
**Cause**: Middleware and page-level checks conflict
**Solution**: Ensure middleware allows /login for unauthenticated users

### Issue: User shows as null even after login
**Cause**: Not calling router.refresh() after auth action
**Solution**: Always call `router.refresh()` after login/logout

### Issue: Server component can't read auth state
**Cause**: Using client Supabase client in server component
**Solution**: Use `await createClient()` from `@/lib/supabase/server`

### Issue: Client component throws error with server client
**Cause**: Using server Supabase client in client component
**Solution**: Use `createClient()` from `@/lib/supabase/client`
