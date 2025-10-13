'use client'

import { useState, useMemo } from 'react'
import { ContainerWithDetails, Location } from '@/lib/db'
import { ContainerList } from './container-list'
import { LocationFilter } from './location-filter'
import { ContainerFAB } from './container-fab'

interface ContainersPageClientProps {
  initialContainers: ContainerWithDetails[]
  locations: Location[]
}

export function ContainersPageClient({
  initialContainers,
  locations,
}: ContainersPageClientProps) {
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)

  // Filter containers based on selected location
  const filteredContainers = useMemo(() => {
    if (!selectedLocationId) {
      return initialContainers
    }
    return initialContainers.filter(
      (container) => container.location_id === selectedLocationId
    )
  }, [initialContainers, selectedLocationId])

  return (
    <>
      <div className="space-y-6">
        {/* Header with Filter */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">보관함</h1>
              <p className="text-muted-foreground">
                {filteredContainers.length}개의 보관함
              </p>
            </div>
          </div>

          {/* Location Filter */}
          {locations.length > 0 && (
            <LocationFilter
              locations={locations}
              onFilterChange={setSelectedLocationId}
            />
          )}
        </div>

        {/* Container List */}
        <ContainerList containers={filteredContainers} />
      </div>

      {/* Floating Action Button */}
      <ContainerFAB />
    </>
  )
}
