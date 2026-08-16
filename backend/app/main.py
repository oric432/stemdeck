import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import separation, storage
from app.config import settings
from app.db import get_db, init_db
from app.models import Job, Song, Stem
from app.schemas import JobCompleteIn, JobFailIn, JobOut, SongOut, StemOut

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        storage.ensure_bucket()
    except Exception:
        # Storage being unreachable at boot shouldn't take down endpoints
        # (like /health) that don't need it — upload/list will surface
        # their own errors when they actually touch storage.
        logger.warning("Could not reach object storage at startup", exc_info=True)
    yield


app = FastAPI(title="AVSeparate", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def verify_internal_secret(x_internal_secret: str | None = Header(default=None)) -> None:
    # settings.internal_api_secret being unset must never be treated as "no
    # secret required" — that would silently open this endpoint to anyone.
    if not settings.internal_api_secret or x_internal_secret != settings.internal_api_secret:
        raise HTTPException(status_code=401, detail="Invalid or missing internal secret")


def _expire_if_stale(job: Job) -> bool:
    if job.status != "processing":
        return False

    created_at = job.created_at
    # SQLite doesn't reliably round-trip tzinfo through DateTime(timezone=True)
    # — a naive read-back here means it was written as UTC, so treat it as such.
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    age = (datetime.now(timezone.utc) - created_at).total_seconds()
    if age < settings.job_timeout_seconds:
        return False

    job.status = "failed"
    job.error = "Timed out waiting for separation to complete."
    return True


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/songs", response_model=SongOut)
def upload_song(file: UploadFile, db: Session = Depends(get_db)) -> SongOut:
    song = Song(title=file.filename or "Untitled", original_key="")
    db.add(song)
    db.flush()

    content = file.file.read()
    song.original_key = storage.upload_original(song.id, file.filename or "upload", content)

    job = Job(song_id=song.id, status="pending")
    db.add(job)
    db.flush()

    call_id = separation.trigger_separation(job.id, song.id, song.original_key)
    if call_id:
        job.modal_call_id = call_id
        job.status = "processing"
    # If the trigger failed, the job is left "pending" with no call id —
    # there's no retry mechanism yet, so it'll sit stuck until one exists.

    db.commit()
    db.refresh(song)

    return _song_out(song)


@app.get("/songs", response_model=list[SongOut])
def list_songs(db: Session = Depends(get_db)) -> list[SongOut]:
    songs = db.query(Song).order_by(Song.created_at.desc()).all()
    # any() would short-circuit and skip calling _expire_if_stale (which has
    # side effects) on jobs after the first stale one — expire them all first.
    expired = [_expire_if_stale(song.job) for song in songs if song.job]
    if any(expired):
        db.commit()
    return [_song_out(song) for song in songs]


@app.get("/songs/{song_id}", response_model=SongOut)
def get_song(song_id: str, db: Session = Depends(get_db)) -> SongOut:
    song = db.get(Song, song_id)
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found")
    if song.job and _expire_if_stale(song.job):
        db.commit()
    return _song_out(song)


@app.get("/songs/{song_id}/stems", response_model=list[StemOut])
def get_stems(song_id: str, db: Session = Depends(get_db)) -> list[StemOut]:
    song = db.get(Song, song_id)
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found")
    return [StemOut(kind=stem.kind, url=storage.presigned_url(stem.r2_key)) for stem in song.stems]


@app.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: str, db: Session = Depends(get_db)) -> Job:
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if _expire_if_stale(job):
        db.commit()
    return job


@app.post("/internal/jobs/{job_id}/complete", dependencies=[Depends(verify_internal_secret)])
def complete_job(job_id: str, payload: JobCompleteIn, db: Session = Depends(get_db)) -> dict[str, str]:
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    for stem in payload.stems:
        db.add(Stem(song_id=job.song_id, kind=stem.kind, r2_key=stem.r2_key))
    job.status = "complete"
    job.error = None
    db.commit()

    # Per the retention policy (ADR 0001/0002): keep stems, drop the original
    # upload once it's no longer needed, to limit how long we hold a full
    # copy of a user's (likely copyrighted) source audio.
    song = db.get(Song, job.song_id)
    if song and song.original_key:
        try:
            storage.delete_object(song.original_key)
        except Exception:
            logger.warning("Failed to delete original upload for song %s", song.id, exc_info=True)

    return {"status": "ok"}


@app.post("/internal/jobs/{job_id}/fail", dependencies=[Depends(verify_internal_secret)])
def fail_job(job_id: str, payload: JobFailIn, db: Session = Depends(get_db)) -> dict[str, str]:
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    job.status = "failed"
    job.error = payload.error
    db.commit()
    return {"status": "ok"}


def _song_out(song: Song) -> SongOut:
    return SongOut(
        id=song.id,
        title=song.title,
        created_at=song.created_at,
        job_status=song.job.status if song.job else "unknown",
    )
