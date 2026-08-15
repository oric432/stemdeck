# 1. Initial architecture

## Status

Accepted

## Context

AVSeparate is a scoped-down Moises-like iOS app: upload a song, AI stem separation, mute/isolate stems while practicing, later synced chords and tempo/pitch control. Starting from an empty repo, solo developer with strong C++/backend/real-time-systems background, new to Swift/SwiftUI and the Python ML ecosystem. Priority order: Phase 1 (separation + playback + mixer) > Phase 2 (chords) > Phase 3 (tempo/pitch).

## Decision

- **Inference**: cloud, not on-device, for v1 — avoids Core ML/Demucs conversion cost up front.
- **Backend**: Python + FastAPI. Separation is a job-queue problem, not low-latency request/response.
- **Model**: Hybrid Transformer Demucs (`htdemucs_ft`), 4-stem for v1 — SOTA open SDR, MIT license.
- **GPU hosting**: Modal (serverless GPU) — zero idle cost, scales to zero.
- **Storage**: Cloudflare R2 (prod), MinIO (local dev) — zero egress fees matter given repeated stem downloads.
- **DB + Auth**: Supabase (Postgres + Auth), Sign in with Apple only.
- **iOS architecture**: MVVM + Swift Concurrency (native, no third-party framework).
- **Audio engine**: AVAudioEngine — node graph for stem mixer, `AVAudioUnitTimePitch` covers Phase 3 tempo/pitch natively.
- **Job status**: client polling (jobs are short, ~10-30s).
- **Chord detection**: madmom, run on bass+other stems (drums/vocals excluded) once Phase 2 lands.
- **Repo**: monorepo (`/ios`, `/backend`, `/docs/adr`), trunk-based, GitHub Actions (path-filtered), XCTest + pytest.
- **Retention**: keep separated stems (song library), delete original upload after processing.

Full rationale and alternatives considered: see the design session — this ADR captures the outcome, not the debate.

## Consequences

- Backend is a real second project (not just an iOS app) — accepted tradeoff for using best-quality open models and to build backend/ML-ops skill deliberately.
- No offline mode in v1; revisit on-device (Core ML) only once core product is validated.
- `AVAudioUnitTimePitch` quality at extreme tempo/pitch shifts is unproven against musician expectations — if it proves insufficient, Rubber Band is the fallback (GPL/commercial license cost accepted at that point, not before).
- Retention policy reduces but does not eliminate copyright/DMCA exposure from processing user-uploaded songs — needs a ToS + takedown contact before public launch.
