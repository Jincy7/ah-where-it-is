# Quick Start Guide - Supabase Backend

## Using the Backend Functions

### 1. Import Functions

```typescript
// Import all at once
import {
  getLocations,
  createLocation,
  getContainers,
  createContainer,
  uploadContainerImage
} from '@/lib/db'

// Or import individually
import { getLocations } from '@/lib/db/locations'
import { getContainers } from '@/lib/db/containers'
```

### 2. Server Component Example

```typescript
// app/page.tsx
import { createClient } from '@/lib/supabase/server'
import { getContainers } from '@/lib/db'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return <div>Please log in</div>
  }

  const containers = await getContainers(user.id)

  return (
    <div>
      <h1>My Containers ({containers.length})</h1>
      <ul>
        {containers.map(container => (
          <li key={container.id}>
            {container.name}
            {container.location && ` - ${container.location.name}`}
            ({container.items_count} items)
          </li>
        ))}
      </ul>
    </div>
  )
}
```

### 3. Client Component Example

```typescript
'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'
import type { Container } from '@/lib/db'

export function ContainerList() {
  const [containers, setContainers] = useState<Container[]>([])
  const supabase = createClient()

  useEffect(() => {
    loadContainers()
  }, [])

  async function loadContainers() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Call API route that uses the db functions
    const response = await fetch('/api/containers')
    const data = await response.json()
    setContainers(data)
  }

  return <div>{/* Render containers */}</div>
}
```

### 4. API Route Example

```typescript
// app/api/containers/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getContainers, createContainer } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const containers = await getContainers(user.id)
    return NextResponse.json(containers)
  } catch (error) {
    console.error('Error fetching containers:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const container = await createContainer({
      user_id: user.id,
      name: body.name,
      location_id: body.location_id,
      internal_photo_url: body.internal_photo_url,
    })

    return NextResponse.json(container, { status: 201 })
  } catch (error) {
    console.error('Error creating container:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

### 5. File Upload Example

```typescript
'use client'

import { uploadContainerImage } from '@/lib/db'
import { useState } from 'react'

export function ImageUploadForm({ userId, containerId }: Props) {
  const [uploading, setUploading] = useState(false)

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setUploading(true)
      const result = await uploadContainerImage(file, userId, containerId)
      console.log('Uploaded:', result.publicUrl)
      // Update container with the new URL
    } catch (error) {
      console.error('Upload failed:', error)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={handleUpload}
        disabled={uploading}
      />
      {uploading && <p>Uploading...</p>}
    </div>
  )
}
```

### 6. Complete CRUD Example

```typescript
import {
  getLocations,
  getLocation,
  createLocation,
  updateLocation,
  deleteLocation,
} from '@/lib/db'

// Get all locations for a user
const locations = await getLocations(userId)

// Get single location
const location = await getLocation(locationId)

// Create new location
const newLocation = await createLocation({
  user_id: userId,
  name: 'Kitchen Cabinet',
  description: 'Upper left cabinet',
})

// Update location
const updated = await updateLocation(locationId, {
  name: 'Updated Name',
  description: 'New description',
})

// Delete location
await deleteLocation(locationId)
```

## Common Patterns

### Error Handling

```typescript
try {
  const container = await getContainer(containerId)
  if (!container) {
    console.log('Container not found')
    return
  }
  // Use container
} catch (error) {
  console.error('Failed to fetch container:', error)
  // Show error to user
}
```

### Authentication Check

```typescript
import { createClient } from '@/lib/supabase/server'

const supabase = await createClient()
const { data: { user }, error } = await supabase.auth.getUser()

if (error || !user) {
  redirect('/login')
}

// User is authenticated, proceed with operations
```

### Filtering and Searching

```typescript
// Get containers in a specific location
const containers = await getContainers(userId, locationId)

// Get items in a container
const items = await getItems(containerId)

// Client-side filtering (after fetching)
const filteredContainers = containers.filter(c =>
  c.name.toLowerCase().includes(searchTerm.toLowerCase())
)
```

## Type Usage

```typescript
import type {
  Location,
  LocationInsert,
  Container,
  ContainerWithDetails,
  Item,
} from '@/lib/db'

// Use types for function parameters
function displayLocation(location: Location) {
  console.log(location.name)
}

// Use insert types for forms
function createLocationForm(data: Omit<LocationInsert, 'user_id'>) {
  // data is typed with name and optional description
}

// Use extended types
function displayContainer(container: ContainerWithDetails) {
  console.log(container.items_count) // Type-safe!
  console.log(container.location?.name) // Type-safe!
}
```

## Debugging

```typescript
// Enable debug logging (in development only)
if (process.env.NODE_ENV === 'development') {
  console.log('User:', user)
  console.log('Containers:', containers)
}

// Check Supabase connection
const supabase = await createClient()
const { data, error } = await supabase.from('locations').select('count')
console.log('Database connection:', error ? 'Failed' : 'OK')
```

## Next Steps

1. Create your authentication pages (`/login`)
2. Build your UI components
3. Implement forms for creating/editing data
4. Add real-time subscriptions (optional)
5. Deploy to production

For more details, see `/Users/changyeobjin/PersonalProjects/storage-manager/docs/SUPABASE_BACKEND.md`
