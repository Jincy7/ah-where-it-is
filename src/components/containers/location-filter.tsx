'use client'

import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Location } from '@/lib/db'
import { MapPin } from 'lucide-react'

interface LocationFilterProps {
  locations: Location[]
  onFilterChange: (locationId: string | null) => void
}

export function LocationFilter({ locations, onFilterChange }: LocationFilterProps) {
  const [selectedLocation, setSelectedLocation] = useState<string>('all')

  const handleValueChange = (value: string) => {
    setSelectedLocation(value)
    onFilterChange(value === 'all' ? null : value)
  }

  return (
    <div className="flex items-center gap-2">
      <MapPin className="h-4 w-4 text-muted-foreground" />
      <Select value={selectedLocation} onValueChange={handleValueChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="위치 선택" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체</SelectItem>
          {locations.map((location) => (
            <SelectItem key={location.id} value={location.id}>
              {location.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
