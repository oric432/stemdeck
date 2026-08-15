# AVSeparate backend

FastAPI service. Job orchestration for stem separation (Modal/htdemucs) and chord detection (madmom); metadata in Supabase Postgres, audio in Cloudflare R2.

## Dev setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

## Test

```bash
pytest
```

## Status

M0: health check only (`GET /health`). Supabase/R2/Modal wiring lands in M1.
