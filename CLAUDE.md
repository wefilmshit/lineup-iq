# LineupIQ

Youth baseball lineup fairness app for Little League coaches. Generates fair lineups ensuring every kid gets equal playing time, position rotation, and batting order fairness across the season.

## Stack
- **Framework:** Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- **UI:** shadcn/ui components (in `src/components/ui/`)
- **Database:** Supabase (Postgres) — no auth, single-team mode
- **Deployment:** Vercel (auto-deploys from `main` branch)
- **Live URL:** https://lineup-iq.vercel.app

## Commands
```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build (run before pushing to check for errors)
npm run lint     # ESLint
```

## Project Structure
```
src/
  app/
    page.tsx              # Home — team settings, recent games
    roster/page.tsx       # Player roster management
    games/
      new/page.tsx        # Create new game + generate lineup
      log/page.tsx        # Log game results (hits)
      [id]/page.tsx       # View game lineup details
      [id]/print/page.tsx # Printable lineup card (share as image)
    fairness/page.tsx     # Season fairness dashboard
  components/
    nav.tsx               # App navigation bar
    ui/                   # shadcn/ui primitives
  lib/
    supabase.ts           # Supabase client (reads env vars)
    types.ts              # TypeScript interfaces for all DB tables
    hooks.ts              # React hooks: useTeam, usePlayers, useGames, useSeasonData
    generate-lineup.ts    # Core lineup generation algorithm
    utils.ts              # Tailwind cn() helper
```

## Key Files
- **`src/lib/generate-lineup.ts`** — The brain. Contains `generateLineup()` (position assignments + batting order) and `computeSeasonStats()` (fairness metrics across all games). Changes here affect how lineups are generated.
- **`src/lib/types.ts`** — All TypeScript interfaces. Must match the Supabase DB schema.
- **`src/lib/hooks.ts`** — Data fetching hooks. All DB reads go through here.

## Database (Supabase)
Tables: `teams`, `players`, `games`, `game_lineups`, `batting_orders`, `pitching_plans`, `game_absences`, `at_bats`

The app runs in single-team mode (one team auto-created on first visit). No authentication.

Environment variables are in `.env.local` (not committed to git):
```
NEXT_PUBLIC_SUPABASE_URL=https://llzgvsglxrivzopvlsqp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

## Lineup Algorithm Rules
- Every available player plays every inning (no bench in standard mode)
- Players rotate positions across innings — max 2 innings at the same position per game
- Every player gets at least 1 infield inning per game
- Pitcher and catcher require `can_pitch`/`can_catch` flags on the player
- First base requires `can_play_1b` flag (safety — need kids who can catch throws)
- Batting order uses slot-fairness: assigns each batting slot to the player who has batted in that slot the fewest times across the season
- Ratings (batting/fielding/pitching 1-10) act as tiebreakers (~20% weight), not primary drivers — fairness always comes first

## Style Guide
- Baseball aesthetic: red accent stripe on nav, diamond divider on print page
- Dark mode supported via next-themes
- Toast notifications via `sonner`
- Keep it simple — this is for volunteer coaches, not MLB analytics
