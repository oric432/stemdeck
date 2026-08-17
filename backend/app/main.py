import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import separation, storage
from app.config import settings
from app.db import get_db, init_db
from app.models import ChordEvent, Job, Song, Stem
from app.schemas import ChordEventOut, JobCompleteIn, JobFailIn, JobOut, SongOut, StemOut

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


app = FastAPI(title="Stemdeck", lifespan=lifespan)

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
    # "pending" covers jobs where trigger_separation itself failed (see its
    # docstring) — those never reach "processing" at all, so without this
    # they'd sit here forever, past every timeout, with their original never
    # cleaned up.
    if job.status not in ("pending", "processing"):
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

    song = job.song
    if song and song.original_key:
        try:
            storage.delete_object(song.original_key)
        except Exception:
            logger.warning("Failed to delete original upload for song %s", song.id, exc_info=True)

    return True


def _delete_song(db: Session, song: Song) -> None:
    # original_key may still point at a real object (song never completed
    # separation) or a stale one already removed by complete_job/fail_job/
    # _expire_if_stale (S3-compatible deletes are idempotent — deleting an
    # already-gone key is a no-op, not an error) — safe to always attempt.
    if song.original_key:
        try:
            storage.delete_object(song.original_key)
        except Exception:
            logger.warning("Failed to delete original upload for song %s", song.id, exc_info=True)
    for stem in song.stems:
        try:
            storage.delete_object(stem.r2_key)
        except Exception:
            logger.warning("Failed to delete stem %s for song %s", stem.kind, song.id, exc_info=True)
    db.delete(song)


def _sweep_expired_stems(db: Session, songs: list[Song]) -> list[Song]:
    """Hard-deletes songs whose stems have gone unplayed past
    settings.stem_retention_days (falling back to created_at for songs that
    finished processing but were never opened, so an uploaded-and-forgotten
    song still expires). Returns the surviving songs, cascade-deleting the
    Job/Stem/ChordEvent rows of the ones it removes.
    """
    threshold = timedelta(days=settings.stem_retention_days)
    now = datetime.now(timezone.utc)
    remaining: list[Song] = []
    changed = False

    for song in songs:
        if not song.job or song.job.status != "complete":
            remaining.append(song)
            continue

        last_active = song.last_played_at or song.created_at
        if last_active.tzinfo is None:
            last_active = last_active.replace(tzinfo=timezone.utc)

        if now - last_active < threshold:
            remaining.append(song)
            continue

        _delete_song(db, song)
        changed = True

    if changed:
        db.commit()

    return remaining


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
def list_songs(
    db: Session = Depends(get_db),
    limit: int | None = Query(default=None, ge=1),
    offset: int = Query(default=0, ge=0),
) -> list[SongOut]:
    # Staleness/expiry sweeps always run over the *full* table, not just the
    # requested page — otherwise a song that's fallen off the end of an
    # infinite-scrolled list would never get swept, defeating the point of
    # storage-bounding expiry for exactly the songs it matters most for.
    songs = db.query(Song).order_by(Song.created_at.desc()).all()
    # any() would short-circuit and skip calling _expire_if_stale (which has
    # side effects) on jobs after the first stale one — expire them all first.
    expired = [_expire_if_stale(song.job) for song in songs if song.job]
    if any(expired):
        db.commit()
    songs = _sweep_expired_stems(db, songs)

    # limit/offset are opt-in — omitting both (as every caller did before
    # pagination existed) returns everything, unchanged from before.
    if limit is not None:
        songs = songs[offset : offset + limit]
    elif offset:
        songs = songs[offset:]

    return [_song_out(song) for song in songs]


@app.get("/songs/{song_id}", response_model=SongOut)
def get_song(song_id: str, db: Session = Depends(get_db)) -> SongOut:
    song = db.get(Song, song_id)
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found")
    if song.job and _expire_if_stale(song.job):
        db.commit()
    return _song_out(song)


@app.delete("/songs/{song_id}", status_code=204)
def delete_song(song_id: str, db: Session = Depends(get_db)) -> None:
    song = db.get(Song, song_id)
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found")
    _delete_song(db, song)
    db.commit()


@app.get("/songs/{song_id}/stems", response_model=list[StemOut])
def get_stems(song_id: str, db: Session = Depends(get_db)) -> list[StemOut]:
    song = db.get(Song, song_id)
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found")
    song.last_played_at = datetime.now(timezone.utc)
    db.commit()
    return [StemOut(kind=stem.kind, url=storage.presigned_url(stem.r2_key)) for stem in song.stems]


@app.get("/songs/{song_id}/chords", response_model=list[ChordEventOut])
def get_chords(song_id: str, db: Session = Depends(get_db)) -> list[ChordEvent]:
    song = db.get(Song, song_id)
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found")
    return sorted(song.chords, key=lambda chord: chord.start_time)


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
    for chord in payload.chords:
        db.add(
            ChordEvent(
                song_id=job.song_id,
                start_time=chord.start_time,
                end_time=chord.end_time,
                chord_label=chord.chord_label,
                confidence=chord.confidence,
            )
        )
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

    song = db.get(Song, job.song_id)
    if song and song.original_key:
        try:
            storage.delete_object(song.original_key)
        except Exception:
            logger.warning("Failed to delete original upload for song %s", song.id, exc_info=True)

    return {"status": "ok"}


def _song_out(song: Song) -> SongOut:
    return SongOut(
        id=song.id,
        title=song.title,
        created_at=song.created_at,
        job_status=song.job.status if song.job else "unknown",
    )
