# 🚨 IMPORTANT TO DO FOR SECURITY

This document outlines the **3 essential server-level actions** required on the **Production VPS** and **Supabase Dashboard** to complete the security hardening of Astrowani.

All backend code, API endpoints, wallet transaction locks, and socket signaling guardrails have already been patched and deployed. These remaining three steps ensure the hosting environment and database permissions are airtight.

---

## 1. Rotate `JWT_SECRET` on the Production VPS

### Why this matters
The backend issues JWT tokens to authenticate customers, astrologers, and admins. If the production secret matches old defaults or is weak, an attacker could forge tokens to impersonate users. The backend code is already configured to refuse to boot if `JWT_SECRET` is less than 32 characters or matches known weak strings.

### Action Steps
1. SSH into your Hostinger VPS.
2. Generate a fresh, cryptographically random 48-byte secret by running:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
3. Open your production `.env` file (located in the backend directory on the VPS):
   ```bash
   nano /path/to/astrowani-backend/.env
   ```
4. Set or update the `JWT_SECRET` variable with the newly generated string:
   ```env
   JWT_SECRET=your_newly_generated_secret_string_here
   ```
5. Save the file (`Ctrl+O`, `Enter`, `Ctrl+X`) and restart the backend service:
   ```bash
   pm2 restart astrowani-backend
   ```

> [!NOTE]
> Rotating this secret invalidates existing login sessions. Users and astrologers will simply need to enter their mobile number and OTP once to log back in.

---

## 2. Apply Access Control SQL in Supabase SQL Editor

### Why this matters
Both mobile apps ship with a Supabase publishable ("anon") key (`sb_publishable_...`). This key is intended to be public, but without column-level permission restrictions, anyone extracting this key could query Supabase directly to read private tables (`customers` PII, `wallet_transactions`, or astrologer bank account numbers).

The backend already uses the secure `SUPABASE_SERVICE_ROLE_KEY` for all operations, so tightening the public `anon` role will **not** affect your backend or legitimate app traffic.

### Action Steps
1. Log in to your **Supabase Dashboard** (https://supabase.com/dashboard).
2. Select your Astrowani project.
3. In the left navigation menu, click **SQL Editor**.
4. Click **New Query**.
5. Copy the entire contents of the migration file:
   `astrowani-backend/sql/hardening_02_access_control.sql`
6. Paste the SQL into the editor and click **Run**.

### What this SQL does
- `REVOKE ALL ON public.customers FROM anon;` (Protects all customer personal data, phone numbers, birth details, and balances from direct public reads).
- `REVOKE ALL ON public.wallet_transactions, public.vendor_wallet_transactions FROM anon;` (Protects all financial ledgers from direct public access).
- Restricts `astrologers` table reads for the public key to public catalog fields only (names, photos, charges) while strictly hiding `bank_account_number`, `bank_ifsc`, `upi_id`, and `admin_notes`.

---

## 3. Set `CORS_ORIGINS` in Production VPS `.env`

### Why this matters
By default, if `CORS_ORIGINS` is unset, the server permits API requests from any web origin. Restricting CORS ensures that malicious third-party websites cannot make unauthorized API calls to your admin or backend endpoints from a victim's browser session.

### Action Steps
1. On your VPS, open the `.env` file:
   ```bash
   nano /path/to/astrowani-backend/.env
   ```
2. Add or update the `CORS_ORIGINS` line:
   ```env
   CORS_ORIGINS=https://admin.astrowani.com,https://backend.astrowani.com
   ```
   *(If you access your admin panel from another domain or local IP, add it separated by a comma).*
3. Save and restart the backend:
   ```bash
   pm2 restart astrowani-backend
   ```

## 4. Apply Customer Concurrency & Anti-Double-Billing SQL in Supabase

### Why this matters
Guarantees at the database level that a customer can never have duplicate concurrent requests or duplicate active billing sessions, physically preventing double-billing under rapid multi-clicking:
1. `uq_one_pending_call_per_customer`: Customer can never have more than one pending call request.
2. `uq_one_pending_chat_per_customer`: Customer can never have more than one pending chat request.
3. `uq_one_active_session_per_customer`: Customer can never have more than one `is_active = true` session at a time, completely preventing simultaneous wallet per-minute drains.

### Action Steps
1. In the **Supabase Dashboard**, go to **SQL Editor**.
2. Click **New Query**.
3. Copy and run the contents of:
   `astrowani-backend/sql/hardening_10_customer_concurrency_race.sql`
4. Click **Run**.

---

## ✅ Post-Configuration Verification

After completing the three steps above, run the database health check from your backend folder to verify:

```bash
cd astrowani-backend
npm run health
```

You should see:
- `Stuck sessions: 0`
- `Negative balances: 0`
- `Public-key exposure: Protected`
