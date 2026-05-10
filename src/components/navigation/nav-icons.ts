import {
  Archive,
  CalendarDays,
  Dumbbell,
  Home,
  MapPinned,
  Plus,
  Search,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import type { NavIconKey } from './nav-config'

export const navIcons: Record<NavIconKey, LucideIcon> = {
  archive: Archive,
  calendarDays: CalendarDays,
  dumbbell: Dumbbell,
  home: Home,
  mapPinned: MapPinned,
  plus: Plus,
  search: Search,
  settings: Settings,
}
