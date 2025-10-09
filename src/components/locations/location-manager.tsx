'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Plus, Pencil, MapPin } from 'lucide-react'
import { LocationDialog } from './location-dialog'
import { DeleteLocationDialog } from './delete-location-dialog'
import type { Tables } from '@/types/supabase'

type Location = Tables<'locations'>

interface LocationManagerProps {
  locations: Location[]
}

export function LocationManager({
  locations: initialLocations,
}: LocationManagerProps) {
  const [locations, setLocations] = useState(initialLocations)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">위치 관리</h2>
        <Button
          onClick={() => {
            setEditingLocation(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          새 위치
        </Button>
      </div>

      {/* Locations List */}
      {locations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">위치가 없습니다</p>
            <p className="text-sm text-muted-foreground mb-4">
              첫 번째 위치를 추가해보세요
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              위치 추가
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((location) => (
            <Card key={location.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  {location.name}
                </CardTitle>
                {location.description && (
                  <CardDescription>{location.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingLocation(location)
                      setDialogOpen(true)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <DeleteLocationDialog
                    location={location}
                    onDelete={(id) => {
                      setLocations(locations.filter((l) => l.id !== id))
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <LocationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        location={editingLocation}
        onSuccess={(newLocation) => {
          if (editingLocation) {
            setLocations(
              locations.map((l) =>
                l.id === newLocation.id ? newLocation : l
              )
            )
          } else {
            setLocations([...locations, newLocation])
          }
          setDialogOpen(false)
        }}
      />
    </div>
  )
}
