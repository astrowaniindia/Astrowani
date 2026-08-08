# Background-removal service

Self-hosted (not a third-party API). Runs on the same VPS as the Node backend,
bound to `127.0.0.1` only — nothing outside the server can reach it directly.
Used exactly once per astrologer profile-photo save, from
`astrowani-backend/src/uploadRoutes.js`. Never called per-frame, never on any
video path.

Segments the person out of an uploaded photo with MediaPipe's Image Segmenter
(`selfie_segmenter.tflite`, committed in this folder) and composites them onto
a plain white background, returned as JPEG.

## Local dev / manual run

```bash
cd astrowani-backend/bg-removal-service
python3 -m venv venv
./venv/bin/pip install -r requirements.txt   # Windows: venv\Scripts\pip
./venv/bin/uvicorn app:app --host 127.0.0.1 --port 5001
```

Requires Python 3.9–3.13 (mediapipe 0.10.35 has no wheel for 3.14 yet as of
this writing). If your system Python is newer, install an older version
alongside it and point `python3.11 -m venv venv` at that instead.

## Production (VPS)

Deployed automatically by `.github/workflows/deploy-backend.yml` on every push
to `main` that touches `astrowani-backend/**`: creates the venv on first
deploy, reinstalls requirements (no-op if unchanged), and runs the service
under PM2 as `bg-removal`, alongside the `astrowani-backend` process.

The Node backend talks to it over `http://127.0.0.1:5001` by default
(override with the `BG_REMOVAL_URL` env var). If this service is down or
errors, `uploadRoutes.js` falls back to the original, unwhitened photo rather
than blocking the profile save — this feature is cosmetic, never a hard
dependency for saving a profile.
