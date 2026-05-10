/**
 * Type-level navigation coverage checks.
 *
 * This file is verified through `pnpm exec tsc --noEmit`.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { navGroups } from '../nav-config'

type NavGroup = (typeof navGroups)[number]
type TopLevelHref = NavGroup['href']
type ChildHrefOf<Group> = Group extends { items: readonly (infer Item)[] }
  ? Item extends { href: infer Href }
    ? Href
    : never
  : never
type ChildHref = ChildHrefOf<NavGroup>
type AllNavHrefs = TopLevelHref | ChildHref

type Expect<T extends true> = T
type HasHref<Href extends string> = Extract<AllNavHrefs, Href> extends never
  ? false
  : true

type _StorageHomeIsAccessible = Expect<HasHref<'/storage'>>
type _StorageSearchIsAccessible = Expect<HasHref<'/search'>>
type _NewContainerIsAccessible = Expect<HasHref<'/container/new'>>
type _StorageToolsAreAccessible = Expect<HasHref<'/settings'>>
type _WorkoutHomeIsAccessible = Expect<HasHref<'/workouts'>>
type _WorkoutHistoryIsAccessible = Expect<HasHref<'/workouts/history'>>
