<img src="https://raw.githubusercontent.com/oric432/stemdeck/main/web/public/logo.svg" width="64" height="64" alt="Stemdeck logo">

# Stemdeck

Web app for musicians practicing songs: AI stem separation, mixer, synced chords, tempo/pitch control. Runs on iOS/Android/desktop through the browser.

- [`/web`](web/) — React app (Vite, Zustand, Tailwind + shadcn/ui)
- [`/backend`](backend/) — FastAPI job orchestration (Modal/htdemucs separation, madmom chords)
- [`/docs/adr`](docs/adr/) — Architecture Decision Records

## Local development

### Just browsing / mixing already-processed songs

Three things, no tunnels needed (the browser talks to MinIO on `localhost` directly):

```
sudo docker start minio          # if it's not already running
cd backend && .venv/bin/uvicorn app.main:app --reload
cd web && npm run dev
```

MinIO won't survive a reboot on its own unless you've set a restart policy on
the container. Do this once and you'll never need `docker start minio` again:

```
sudo docker update --restart=unless-stopped minio
```

### Uploading a new song (triggers Modal separation)

This additionally needs the backend and MinIO reachable from Modal's cloud,
which means two `ngrok` tunnels. **Only needed for new uploads** — already-
processed songs play back fine with just the section above.

1. Backend tunnel — permanent URL, doesn't change between restarts:
   ```
   ngrok http --url=twenty-dispatch-matrix.ngrok-free.dev 8000
   ```
2. MinIO tunnel — **ephemeral**, gets a new random URL every time it's
   restarted (ngrok's free plan only allows one reserved/static domain, and
   it's already spent on the backend above):
   ```
   ngrok http 9000
   ```
3. Whenever step 2 gives you a *new* MinIO URL (i.e. any time that tunnel
   was restarted — reboot, closed terminal, etc.), sync it to the Modal
   secret Modal's function reads at runtime:
   ```
   cd backend
   modal secret create avseparate-secrets \
     S3_ENDPOINT_URL=<the ngrok URL from step 2> \
     S3_BUCKET=avseparate-dev \
     S3_ACCESS_KEY_ID=minioadmin \
     S3_SECRET_ACCESS_KEY=minioadmin \
     S3_REGION=us-east-1 \
     BACKEND_URL=https://twenty-dispatch-matrix.ngrok-free.dev \
     INTERNAL_API_SECRET=<value from backend/.env> \
     --force
   ```
   The backend URL never needs to change here — only the MinIO one does.

If a fresh upload gets stuck on "Separating" or fails outright, this
(stale MinIO tunnel URL) is the first thing to check.
