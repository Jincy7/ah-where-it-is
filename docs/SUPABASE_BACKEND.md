# Supabase Backend Integration Guide

## Overview

Complete Supabase backend integration for the "아 그거 어딨지" storage management system.

**Status:** ✅ Fully Implemented and Type-Safe

---

## 📁 File Structure

```
/Users/changyeobjin/PersonalProjects/storage-manager/
├── .env.local                          # Environment variables
├── middleware.ts                       # Authentication middleware
├── src/
│   ├── types/
│   │   └── supabase.ts                # Generated TypeScript types (266 lines)
│   └── lib/
│       ├── supabase/
│       │   ├── server.ts              # Server-side Supabase client (44 lines)
│       │   ├── client.ts              # Client-side Supabase client (25 lines)
│       │   └── middleware.ts          # Middleware helper (61 lines)
│       └── db/
│           ├── index.ts               # Central exports (50 lines)
│           ├── locations.ts           # Location CRUD operations (200 lines)
│           ├── containers.ts          # Container CRUD operations (263 lines)
│           ├── items.ts               # Item CRUD operations (196 lines)
│           └── storage.ts             # File upload/delete operations (255 lines)
```

**Total:** 1,435 lines of production-ready code

---

## ✅ Success Criteria - All Met!

1. ✅ **Dependencies Installed**
   - `@supabase/supabase-js@2.74.0`
   - `@supabase/ssr@0.7.0`

2. ✅ **TypeScript Types Generated**
   - Location: `/Users/changyeobjin/PersonalProjects/storage-manager/src/types/supabase.ts`
   - Generated from local Supabase schema
   - Includes all tables: `locations`, `containers`, `items`

3. ✅ **Supabase Client Utilities Created**
   - Server client: `/Users/changyeobjin/PersonalProjects/storage-manager/src/lib/supabase/server.ts`
   - Browser client: `/Users/changyeobjin/PersonalProjects/storage-manager/src/lib/supabase/client.ts`
   - Middleware helper: `/Users/changyeobjin/PersonalProjects/storage-manager/src/lib/supabase/middleware.ts`

4. ✅ **Authentication Middleware Configured**
   - Location: `/Users/changyeobjin/PersonalProjects/storage-manager/middleware.ts`
   - Protected routes: `/`, `/container/*`, `/settings`, `/print/*`
   - Public routes: `/login`, `/_next/*`, `/favicon.ico`
   - Auto-redirects: Unauthenticated → `/login`, Authenticated `/login` → `/`

5. ✅ **All CRUD Operations Implemented**
   - Locations: 5 functions (get, getAll, create, update, delete)
   - Containers: 5 functions with location joins and item counts
   - Items: 5 functions
   - Storage: 4 functions (upload, delete, getUrl, replace)

6. ✅ **TypeScript Compilation**
   - No errors (`npx tsc --noEmit` passes)
   - All imports resolve correctly
   - Full type safety with generated types

7. ✅ **Environment Variables**
   - Server: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - Client: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 🚀 Usage Examples

### Server Component (App Router)

```typescript
import { createClient } from '@/lib/supabase/server'
import { getLocations, getContainers } from '@/lib/db'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return <div>Not authenticated</div>

  // Get all locations for user
  const locations = await getLocations(user.id)

  // Get all containers
  const containers = await getContainers(user.id)

  return (
    <div>
      <h1>Locations: {locations.length}</h1>
      <h1>Containers: {containers.length}</h1>
    </div>
  )
}
```

### Client Component

```typescript
'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'

export function UserProfile() {
  const [user, setUser] = useState(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })
  }, [])

  return <div>Welcome, {user?.email}</div>
}
```

### Creating Data

```typescript
import { createLocation, createContainer, createItem } from '@/lib/db'

// Create a location
const location = await createLocation({
  user_id: userId,
  name: 'Kitchen Cabinet',
  description: 'Upper left cabinet above the sink'
})

// Create a container
const container = await createContainer({
  user_id: userId,
  name: 'Storage Box A',
  location_id: location.id,
  internal_photo_url: null
})

// Create an item
const item = await createItem({
  container_id: container.id,
  name: 'Winter Jacket',
  description: 'Black north face jacket, size M'
})
```

### Image Upload

```typescript
import { uploadContainerImage, replaceContainerImage } from '@/lib/db'

// Upload a new image
const result = await uploadContainerImage(file, userId, containerId)
console.log('Image URL:', result.publicUrl)

// Replace an existing image
const result = await replaceContainerImage(
  newFile,
  userId,
  containerId,
  container.internal_photo_url
)
```

### Updating and Deleting

```typescript
import {
  updateLocation,
  deleteLocation,
  updateContainer,
  deleteContainer,
  updateItem,
  deleteItem
} from '@/lib/db'

// Update operations
await updateLocation(locationId, { name: 'Living Room' })
await updateContainer(containerId, { location_id: newLocationId })
await updateItem(itemId, { name: 'Updated Name' })

// Delete operations
await deleteItem(itemId)
await deleteContainer(containerId) // Cascades to items
await deleteLocation(locationId) // Sets containers' location_id to null
```

---

## 🔒 Security Features

1. **Row Level Security (RLS)**
   - All queries filtered by `user_id`
   - Authenticated users can only access their own data

2. **Environment Variables**
   - Service role key only available server-side
   - Public keys properly prefixed with `NEXT_PUBLIC_`

3. **Authentication Middleware**
   - Automatic session refresh
   - Protected route enforcement
   - Redirect handling

4. **File Upload Validation**
   - File type checking (JPEG, PNG, WebP, GIF)
   - Size limit: 10MB
   - Unique file naming to prevent collisions

---

## 📊 Database Schema

### Tables

**locations**
- `id` (uuid, primary key)
- `user_id` (uuid, not null)
- `name` (text, not null)
- `description` (text, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

**containers**
- `id` (uuid, primary key)
- `user_id` (uuid, not null)
- `name` (text, not null)
- `location_id` (uuid, nullable, FK → locations)
- `internal_photo_url` (text, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

**items**
- `id` (uuid, primary key)
- `container_id` (uuid, not null, FK → containers)
- `name` (text, not null)
- `description` (text, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### Storage Bucket

**container-images**
- Public read access
- Authenticated write access
- Stores container interior photos

---

## 🛠️ Available Scripts

```bash
# Generate TypeScript types from Supabase schema
pnpm run types:supabase

# Type check (should pass with no errors)
npx tsc --noEmit

# Start development server
pnpm dev
```

---

## 📝 Type Exports

All types are exported from the central index:

```typescript
import {
  // Locations
  Location,
  LocationInsert,
  LocationUpdate,

  // Containers
  Container,
  ContainerInsert,
  ContainerUpdate,
  ContainerWithDetails,

  // Items
  Item,
  ItemInsert,
  ItemUpdate,

  // Storage
  UploadImageResult,
} from '@/lib/db'
```

---

## 🎯 Next Steps

With the backend fully implemented, you can now:

1. **Create API Routes** (if needed for client-side operations)
   ```typescript
   // app/api/containers/route.ts
   import { createContainer } from '@/lib/db'
   import { createClient } from '@/lib/supabase/server'

   export async function POST(request: Request) {
     const supabase = await createClient()
     const { data: { user } } = await supabase.auth.getUser()

     if (!user) {
       return Response.json({ error: 'Unauthorized' }, { status: 401 })
     }

     const body = await request.json()
     const container = await createContainer({ ...body, user_id: user.id })

     return Response.json(container)
   }
   ```

2. **Implement Frontend Pages**
   - Use the CRUD functions in Server Components
   - Create forms for data input
   - Display lists and details

3. **Add Authentication Pages**
   - Login page at `/login`
   - Signup flow
   - Password reset

4. **Implement Real-time Updates** (optional)
   ```typescript
   const supabase = createClient()

   supabase
     .channel('containers')
     .on('postgres_changes',
       { event: '*', schema: 'public', table: 'containers' },
       (payload) => console.log('Change!', payload)
     )
     .subscribe()
   ```

---

## 🐛 Troubleshooting

### TypeScript Errors
```bash
# Regenerate types
pnpm run types:supabase

# Clear Next.js cache
rm -rf .next
pnpm dev
```

### Authentication Issues
- Check middleware configuration
- Verify environment variables are set
- Ensure Supabase local instance is running

### Database Connection
```bash
# Check Supabase status
supabase status

# Restart Supabase
supabase stop
supabase start
```

---

## 📚 Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Supabase + Next.js Guide](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)

---

**Implementation Date:** October 9, 2025
**Supabase CLI Version:** v2.24.3
**Project:** storage-manager
