# Hindi/English Localization — Backend & Admin

## Which tables carry Hindi text

| Table | Hindi columns | Migration |
|---|---|---|
| `blogs` | `title_hi`, `content_hi` (pre-existing) | already in `sql/admin_schema.sql` |
| `categories` | `name_hi` | `sql/hindi_translations.sql` |
| `banners` | `title_hi`, `description_hi` | `sql/hindi_translations.sql` |
| `remedy_items` | `title_hi`, `description_hi` | `sql/hindi_translations.sql` |
| `thoughts` | `text_hi`, `author_hi` | `sql/hindi_translations.sql` |

Run `sql/hindi_translations.sql` in the Supabase SQL editor (idempotent — uses
`ADD COLUMN IF NOT EXISTS`).

Astrologers have **no bio/description field to translate** — only `first_name`/`last_name`
(proper nouns, never translated) and `specialties` (an array of category IDs, resolved to
category **names** via the `categories` table — so translating `categories.name_hi` already
covers this).

## Response shape convention

Every endpoint that serves bilingual content returns a `hindi: {...}` sub-object per row/response,
falling back to the English value when the `_hi` column is empty. This mirrors the pre-existing
`/api/blogs` pattern (`english: {title, content}`, `hindi: {title, content}`).

- `GET /api/categories` → each category: `{ _id, name, image, hindi: { name } }`
- `GET /api/banners/all` → each banner: `{ id, title, description, imageUrl, link, hindi: { title, description } }`
- `GET /api/thoughts/latest` → `{ thoughtText, author, hindi: { thoughtText, author } }`
- `GET /api/remedies` → each item: `{ _id, type, title, description, price, image, hindi: { title, description } }`
- `GET /api/blogs` → unchanged (already had `hindi: { title, content }`)

Client convention (customer app): `language === 'Hindi' ? (row.hindi?.field || row.field) : row.field`.

## Admin dashboard

Each admin form that edits one of the tables above now has a parallel Hindi input field next to
the English one, following the same layout `Blogs.jsx` already used for `title_en`/`title_hi`:

- `astrowani-admin/src/pages/Categories.jsx` — "Name (English)" / "Name (Hindi)"
- `astrowani-admin/src/pages/Banners.jsx` — "Title/Description (English)" / "(Hindi)"
- `astrowani-admin/src/pages/Remedies.jsx` — "Title/Description (English)" / "(Hindi)"
- `astrowani-admin/src/pages/Thoughts.jsx` — "Thought text/Author (English)" / "(Hindi)"

All fields are optional — leaving a Hindi field blank means the app shows the English text when
Hindi is selected (server-side fallback handles this).

## Wiring a new `_hi` column end-to-end

1. `ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <field>_hi text;` — add to `sql/hindi_translations.sql`
   (or a new migration file) and run in Supabase.
2. `astrowani-backend/src/adminRoutes.js` — add the new column name to that table's `crud(...)`
   `allowed` array so admin POST/PUT can write it.
3. `astrowani-admin/src/pages/<Page>.jsx` — add the Hindi input next to the English one, add the
   key to that page's `EMPTY` object.
4. `astrowani-backend/index.js` — in the customer-facing GET endpoint for that table, add the
   field to the row's `hindi: {...}` sub-object with an English fallback.
5. Customer app — wherever the field is rendered, branch on `language` (see
   `astrowani_customer-main/HINDI_I18N_APP.md`).

## Astrologer names / specialties

Astrologer `name` (first + last) is a proper noun and is **never translated** — this is an
explicit product decision (see `astrowani_customer-main/HINDI_I18N_APP.md`, "What is NEVER
translated"). `specialties`/`categoryNames` in `formatAstrologer()` (`index.js`) already resolve
through the `categories` table, so once `categories.name_hi` is filled in via the admin dashboard,
a Hindi specialty name is available — but `formatAstrologer()` itself does not yet expose a
`hindi.categoryNames` field. If a screen needs the Hindi specialty name, extend
`formatAstrologer()` the same way as the other endpoints above.
