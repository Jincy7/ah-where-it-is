# Storage Manager Agent Notes

This repository uses a personal SDD control-plane setup for planning and verification.

## Working Boundary

- Treat this repository root as the full context boundary.
- Keep SDD/GSD planning artifacts local unless the team explicitly opts in to tracking them.
- Prefer pnpm for all Node package operations; this project declares `pnpm@10.10.0`.

## Project Shape

- Next.js App Router application under `src/app`.
- Supabase auth, database, and storage helpers live under `src/lib`.
- UI components are shadcn/Radix-style components under `src/components`.
- Supabase schema and policies are under `supabase/migrations`.

## Design Guidance

- Read `design.md` before adding or changing UI, user flows, copy, navigation, forms, empty states, or visual assets.
- Keep new feature work consistent with the patterns in `design.md`; update that file when a feature intentionally changes the product's design baseline.

## Verification

- Run `pnpm lint` after source or dependency changes.
- Run `pnpm build` when framework, React, Next.js, config, or runtime dependencies change.
- Run `pnpm audit` after dependency migration work.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
