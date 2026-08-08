# Project State

**Last updated:** 2026-07-24
**Authoritative deep docs:** `CLAUDE.md` (living architecture) + `memory/MEMORY.md` (per-feature notes).

## Monorepo (4 sub-projects)
- `astrowani-backend/` — Node/Express + Socket.io (:4500), Supabase, billing RPC.
- `astrowani_customer-main/` — React Native customer app.
- `astrowani_vendors-main/` — React Native vendor/astrologer app.
- `astrowani-admin/` — React + Vite **admin dashboard** (web only, :5173).

## Current focus
Preparing the Astrowani backend and Admin Dashboard for deployment onto the user's Hostinger VPS alongside BeHappyTalk.

## Current Phase
VPS Deployment Planning & Configuration

## Work Completed (This Session)
- Investigated and mapped existing API/Socket configurations pointing to Render (`https://astrowani.onrender.com`).
- Created Nginx configurations for backend reverse proxy ([nginx-backend](file:///d:/Projects/Astrowani/vps-deployment/nginx/astrowani-backend.conf)) on port `4500` and admin panel static hosting ([nginx-admin](file:///d:/Projects/Astrowani/vps-deployment/nginx/astrowani-admin.conf)).
- Created a deployment automation shell script ([deploy.sh](file:///d:/Projects/Astrowani/vps-deployment/scripts/deploy.sh)) to set up server directory structure, launch backend processes via PM2, apply domain names to Nginx configurations, test configurations, reload services, and execute Certbot SSL certificates.
- Generated a detailed step-by-step walkthrough documentation ([VPS_DEPLOYMENT_GUIDE.md](file:///d:/Projects/Astrowani/vps-deployment/VPS_DEPLOYMENT_GUIDE.md)) for DNS configuration, local building, and uploading procedures.

## Next Recommended Action
1. User creates DNS `A` records for `backend.astrowani.com` and `admin.astrowani.com` pointing to the VPS.
2. Compile the `astrowani-admin` React panel locally (`npm run build`) pointing `VITE_API_URL` to `https://backend.astrowani.com`.
3. Upload files to the VPS (via SCP or Git) and execute `vps-deployment/scripts/deploy.sh`.
4. Update `SOCKET_URL` to `https://backend.astrowani.com` in Customer and Vendor React Native apps.

## Open Issues
- Pointing mobile apps to `backend.astrowani.com` and rebuilds.

## Blockers
- None (waiting for user DNS setup).

---
**CLAUDE.md is the living architecture doc; this file is the high-level snapshot.**
