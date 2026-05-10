export const navIconKeys = [
  'archive',
  'calendarDays',
  'dumbbell',
  'home',
  'mapPinned',
  'plus',
  'search',
  'settings',
] as const

export type NavIconKey = (typeof navIconKeys)[number]

export interface NavItem {
  href: string
  label: string
  icon: NavIconKey
}

export interface NavGroup extends NavItem {
  items?: readonly NavItem[]
}

export const navGroups = [
  {
    href: '/',
    label: '홈',
    icon: 'home',
  },
  {
    href: '/storage',
    label: '보관함',
    icon: 'archive',
    items: [
      {
        href: '/storage',
        label: '보관함 목록',
        icon: 'archive',
      },
      {
        href: '/search',
        label: '물품 검색',
        icon: 'search',
      },
      {
        href: '/container/new',
        label: '새 보관함',
        icon: 'plus',
      },
      {
        href: '/settings',
        label: '위치와 QR 도구',
        icon: 'mapPinned',
      },
    ],
  },
  {
    href: '/workouts',
    label: '운동',
    icon: 'dumbbell',
    items: [
      {
        href: '/workouts',
        label: '오늘 운동',
        icon: 'dumbbell',
      },
      {
        href: '/workouts/history',
        label: '운동 캘린더',
        icon: 'calendarDays',
      },
    ],
  },
  {
    href: '/settings',
    label: '설정',
    icon: 'settings',
  },
] as const satisfies readonly NavGroup[]

export const bottomNavItems = [
  {
    href: '/',
    label: '홈',
    icon: 'home',
  },
  {
    href: '/storage',
    label: '보관함',
    icon: 'archive',
  },
  {
    href: '/workouts',
    label: '운동',
    icon: 'dumbbell',
  },
  {
    href: '/settings',
    label: '설정',
    icon: 'settings',
  },
] as const satisfies readonly NavItem[]
