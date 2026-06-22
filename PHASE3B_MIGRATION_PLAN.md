# Phase 3B.0: Database Migration Plan

## 1. Context & Execution Verification
- **Execution Authority:** Supabase migrations must be executed via the Supabase Dashboard SQL Editor or via the Supabase CLI using the Service Role Key. 
- **Current State:** The backend currently does not use Prisma, Sequelize, or any automated migration tool (it uses the raw `@supabase/supabase-js` client). Therefore, this migration must be applied manually by a database administrator via the Supabase SQL Editor.

## 2. Backward Compatibility Analysis
A comprehensive `grep` search across the codebase revealed the following interaction patterns with the `chat_sessions` table:

**Reads (`select('*')`):**
- `MySessionScreen.js`
- `ChatSessionScreen.js`
- `VendorChatSession.js`
- `ChatHiostory.tsx`
*Analysis:* JavaScript/React Native consumes database rows as JSON objects. Returning extra keys (`call_type`, `room_id`, etc.) via `select('*')` is perfectly safe and will not break UI mapping or state logic.

**Writes (`insert(...)`):**
- `HomeScreen.js`
- `ChatApi.js` (Customer & Vendor)
*Analysis:* All inserts use named object keys (e.g., `insert([{ vendor_id: '...', caller_id: '...' }])`). Adding new columns with default values or making them nullable ensures that existing insert queries will continue to succeed without throwing "missing column" errors.

**Conclusion:** Adding the new columns is **100% backward compatible** and will not break any existing application logic or screens.

## 3. SQL Migration Scripts

### **Migration SQL (Up)**
```sql
-- 1. Add required columns for unified communication tracking
ALTER TABLE public.chat_sessions 
ADD COLUMN IF NOT EXISTS call_type text DEFAULT 'chat',
ADD COLUMN IF NOT EXISTS room_id text,
ADD COLUMN IF NOT EXISTS call_request_id uuid,
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS next_billing_at timestamptz;

-- 2. Retroactively fix 'is_active' state for any sessions currently in progress
UPDATE public.chat_sessions 
SET is_active = true 
WHERE ended_at IS NULL;

-- 3. (Optional but recommended) Add an index to speed up the SessionManager interval queries
CREATE INDEX IF NOT EXISTS idx_chat_sessions_billing 
ON public.chat_sessions(is_active, next_billing_at);
```

### **Rollback SQL (Down)**
```sql
-- 1. Drop the index
DROP INDEX IF EXISTS public.idx_chat_sessions_billing;

-- 2. Drop the newly added columns
ALTER TABLE public.chat_sessions 
DROP COLUMN IF EXISTS call_type,
DROP COLUMN IF EXISTS room_id,
DROP COLUMN IF EXISTS call_request_id,
DROP COLUMN IF EXISTS is_active,
DROP COLUMN IF EXISTS next_billing_at;
```

## 4. Affected Files (Future Phases)
Once the database is migrated, the following files will be modified in upcoming sub-phases to utilize the new columns:
- **`astrowani_vendors-main/src/screens/Home/HomeScreen.js`**: Update the `insert` block to explicitly pass `call_type`, `room_id`, `is_active: true`, and `next_billing_at`.
- **`astrowani-backend/index.js`**: The new `SessionManager` interval will query based on `is_active` and `next_billing_at`.

---
**Status:** MIGRATION PLAN COMPLETE
**Action:** Waiting for explicit approval to proceed with Phase 3B.1 (Mobile App Insert Updates), assuming the database administrator executes the SQL above.
