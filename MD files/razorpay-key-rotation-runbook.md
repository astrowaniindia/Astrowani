# Razorpay live key rotation — runbook

**Status: NOT DONE. This is the one launch blocker Claude cannot close for you** — it
needs Razorpay dashboard access and a VPS environment change. Everything on the code
side is already in the right shape; see "Why no code change is needed" below.

## What happened

`astrowani_customer-main/src/screens/Home/GemStoneBuy.tsx` contained a hardcoded **live**
Razorpay key. The file was deleted on 2026-08-21 (commit `cce0b2f`) along with the other
dead gemstone/puja screens, but **deleting a file does not un-expose a secret committed to
git history.** The key is still recoverable from any clone of this repository in one
command:

```bash
git show cce0b2f^:astrowani_customer-main/src/screens/Home/GemStoneBuy.tsx | grep rzp_live
```

Verified still recoverable on 2026-09-05. It appears in four commits, from the initial
monorepo commit through its deletion.

History was deliberately **not** rewritten — that would break every existing clone and
does not help anyway, because anyone who cloned before the rewrite still has the key.
**Rotation is the only real fix.**

## Why no code change is needed

Both live payment paths already take the key from the server at runtime, not from a
constant in the bundle:

| Path | App reads | Backend supplies |
|---|---|---|
| Wallet recharge | `Wallet.js:78` → `key: keyId` | `index.js:3867` → `razorpay.RAZORPAY_KEY_ID` |
| Remedy checkout | `PaymentScreen.js:133` → `key: created.keyId` | `orderRoutes.js:763` → `razorpay.RAZORPAY_KEY_ID` |

`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` are environment variables on the VPS. Confirmed
2026-09-05: `git grep "rzp_live\|rzp_test"` across all tracked source (excluding build
output and node_modules) returns **zero** matches. So rotating is purely operational —
change the env vars and restart. No app release, no OTA.

## The rotation, in this order

Order matters. Doing step 5 before step 3 takes payments down for everyone.

1. **Razorpay Dashboard → Settings → API Keys → Generate Key.** Razorpay allows the old
   and new key to be active simultaneously, which is what makes a zero-downtime swap
   possible. Copy both the new Key ID and Key Secret now — the secret is shown once.

2. **Check for other consumers of the old key before disabling anything.** At minimum:
   any Razorpay webhook configuration, the `astrowani-shop` storefront, and any payment
   links or saved integrations. If something else is using it, it breaks at step 5.

3. **Update the VPS environment** wherever `SUPABASE_SERVICE_ROLE_KEY` and `JWT_SECRET`
   already live for the running process (PM2 ecosystem file / `.env` / systemd unit — see
   CLAUDE.md subsystem K):

   ```
   RAZORPAY_KEY_ID=<new key id>
   RAZORPAY_KEY_SECRET=<new key secret>
   ```

4. **Restart the backend process and verify a real payment end to end.** Not just that the
   server boots — actually complete one wallet recharge, because the *secret* is what
   signs `verify-payment`, and a mismatched secret fails only at verification, after the
   customer has already been charged. A ₹1 recharge is enough.

   The signature check lives in `POST /api/wallet/verify-payment`; a wrong secret shows up
   as a verification failure there, not as a boot error.

5. **Only once step 4 passes: disable the old key in the Razorpay dashboard.**

6. Sanity-check `admin_wallet_transactions` and `wallet_recharges` picked up the test
   recharge, then reverse the ₹1 if you care to.

## What rotation does and does not fix

- **Fixes:** the exposed key stops being able to move money the moment it is disabled.
- **Does not fix:** the old key string remains in git history forever. That is harmless
  once the key is disabled — it becomes a dead string.
- **Worth doing regardless:** treat any secret that has ever been committed as burned.
  The same reasoning applies to `android/gradle.properties`, which is tracked and contains
  the upload keystore passwords (`MYAPP_UPLOAD_STORE_PASSWORD=astrowani`). That is a
  separate, lower-severity item — the `.keystore` file itself is correctly gitignored, so
  the password alone is not sufficient to sign a release — but it should move to
  `~/.gradle/gradle.properties` or an environment variable and the passwords should be
  changed.

## Verification that this was actually done

Once complete, `RAZORPAY_KEY_ID` on the VPS should not match the string in
`git show cce0b2f^:...GemStoneBuy.tsx`. Record the rotation date here:

> Rotated on: _____________  by: _____________
