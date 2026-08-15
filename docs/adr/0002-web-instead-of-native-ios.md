# 2. Web app instead of native iOS

## Status

Accepted — supersedes the client-side portions of [0001](0001-initial-architecture.md)

## Context

The original design (ADR 0001) specified a native SwiftUI/iOS app. In practice, this environment has no Mac/Xcode, and Apple's iOS toolchain has no supported way to run anywhere else — that's a hard blocker for native iOS development here, not a preference. A native-iOS M0 skeleton was built and then discarded once this became clear.

## Decision

Replace the native iOS client with a responsive React web app (Vite, Zustand, Tailwind + shadcn/ui), reachable on iOS, Android, and desktop through the browser. See the updated design doc for full decision detail: frontend framework, audio engine (Web Audio API), hosting (Cloudflare Pages), auth (Google Sign-In via Supabase, Apple's App Store Guideline 4.8 no longer applying), state management (Zustand), testing (Vitest + Playwright), and tempo/pitch (SoundTouch.js in place of AVAudioUnitTimePitch).

All backend decisions from ADR 0001 (Python/FastAPI, htdemucs_ft on Modal, R2 storage, Supabase Postgres, madmom, monorepo, CI/CD, retention policy) are unchanged.

## Consequences

- No App Store presence, no $99/yr Apple Developer Program cost, no Mac dependency for day-to-day development.
- All iOS browsers (Chrome included) run on Apple's WebKit engine — the iOS-specific background-audio/autoplay constraints that would have applied to a native app's WKWebView still apply here and need real-device verification before Phase 1 closes.
- Loses the originally stated goal of learning SwiftUI/native iOS deployment; gains a path to a genuine C++-adjacent project (WASM DSP) in Phase 3 that the native plan didn't offer.
- A native wrapper (Capacitor/Tauri) or full native rebuild remains a valid future option if the web product validates and App Store distribution becomes worth the investment — see Future Expansion in the design doc.
