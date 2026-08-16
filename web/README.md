# Stemdeck web

React + Vite + TypeScript. Zustand for cross-component state (playback/mixer). Tailwind CSS v4 + shadcn/ui (`new-york` style, neutral base) for UI, lucide-react for icons, motion for animation.

## Dev setup

```bash
npm install
npm run dev
```

Run the backend locally first (`cd ../backend && uvicorn app.main:app --reload`) — the app checks `GET http://localhost:8000/health` on load and shows reachable/unreachable. Override the backend URL with `VITE_API_BASE_URL`.

## Test

```bash
npx tsc -b            # typecheck
npm run lint           # oxlint
npx vitest run          # unit/component tests
npx playwright test     # e2e (needs `npx playwright install --with-deps` once)
```

## Adding shadcn/ui components

```bash
npx shadcn@latest add <component>
```

## Status

M0: skeleton app, health check against the backend, one Vitest suite, one Playwright smoke test. No upload/mixer yet (M1-M3).
