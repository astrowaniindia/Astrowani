# Database Hardening — Deferred Decisions

Two items deliberately held back from the 2026-08-07/08 database hardening pass (see
`astrowani-backend/DATABASE_HARDENING_HANDOFF.md` for the full history). Everything else from
that effort is done and deployed: JWT rotated, indexes/FKs/CHECK constraints applied, atomic
wallet functions live, the anon-key PII/wallet exposure closed and verified, `chat_sessions`/
`call_requests`/`chat_requests`/`chat_messages` inserts moved behind backend endpoints, a
double-billing race in `process_session_billing` found and fixed, duplicate customer accounts
merged, a `UNIQUE` constraint added on `customers.mobile`.

These two are explicitly the user's calls to make, not oversights — tracked here so they don't
get lost.

## TODO 1 — Real RLS (Row Level Security), not just column grants

**Current state**: access control on the core tables (`customers`, `astrologers`,
`chat_sessions`, `call_requests`, `chat_requests`, `chat_messages`, `wallet_transactions`,
`vendor_wallet_transactions`) is enforced via column-level `GRANT`/`REVOKE` on the `anon` role,
not real RLS policies. This works today and is verified against production, but it's a
structurally weaker ceiling than real RLS:

- Protection depends on every column grant being exactly right, forever. Add a new sensitive
  column to `astrologers` (say) without remembering to update the grant list, and it's silently
  exposed to the anon key again — no policy engine catches the mistake.
- Real RLS with `auth.uid()`-based policies would enforce "this row belongs to this caller" at
  the database layer itself, independent of which columns anyone thinks to list.

**Why it's not done**: the apps authenticate against a custom Express-issued JWT, not Supabase
Auth. `auth.uid()` inside an RLS policy is always `NULL` for these apps' requests today, so no
per-row ownership policy is currently expressible. Getting there requires migrating both apps'
login flow to Supabase Auth — a real, non-trivial project, not a quick toggle.

**Decision needed from the user**: stay on the custom-JWT + column-grants model permanently (in
which case this item can be closed, not just deferred), or commit to the Supabase Auth
migration at some point. No urgency either way — flagged here so it's a deliberate choice, not
a default.

## TODO 2 — Supabase backups / Point-in-Time Recovery

**Current state**: not confirmed enabled. Supabase project settings → Database → Backups.

**Why it matters**: everything else in this hardening pass assumes a mistake can be corrected
after the fact (a bad migration, a fat-fingered `UPDATE`, a future bug). Right now, if something
ever goes wrong badly enough, there is no undo. This is true independent of anything else being
"done" — it's the one item that caps how safe the whole database actually is.

**Decision needed from the user**: confirm current plan tier and whether PITR/backups are on;
upgrade if not. Not a code change — this is a Supabase dashboard + billing decision, deliberately
left to the user rather than acted on automatically.
