---
description: Scaffold a new Supabase migration file with the repo's timestamp-prefixed naming convention
---

Create a new empty migration file under `supabase/migrations/` for: $ARGUMENTS

Do this:

1. Check the most recent existing filenames (`ls supabase/migrations | tail -5`) to confirm the
   naming convention is still `YYYYMMDDHHMMSS_description.sql` (14-digit UTC timestamp, underscore,
   short snake_case description — e.g. `20260812140030_storage.sql`).
2. Generate a timestamp for _now_ (don't reuse or guess an old one — it must sort after every
   existing migration) and a short snake_case description derived from $ARGUMENTS.
3. Create the file with a header comment naming what it does, then leave the SQL body for the user
   to fill in (don't invent schema/RLS/RPC content — that needs actual design, not a template). If
   the migration adds a new table, remind yourself (and the user) in that header comment that an
   `_grants.sql`-style companion GRANT is required in addition to any RLS policy — see the existing
   `supabase/migrations/*_grants.sql` for why (`auto_expose_new_tables` is off).
4. Remind the user of the actual next steps:
   - `npx supabase db reset` to apply it locally (destructive to local data — confirm before
     running it for them; requires Docker Desktop running)
   - `npx supabase gen types typescript --local > packages/types/src/database.ts` to regenerate
     the hand-written placeholder in `packages/types/src/database.ts` once the schema is final
   - `npx supabase db push` only once verified locally, and only if/when this repo is linked to a
     hosted Supabase project (not yet true at time of writing — confirm with the user before ever
     suggesting this)

Do not run `db reset` or `db push` yourself without the user explicitly confirming — both mutate
real database state (local data loss / a live hosted project respectively).
