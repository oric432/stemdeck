import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import storage
from app.config import settings
from app.db import get_db, init_db
from app.models import Job, Song
from app.schemas import SongOut

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
    db.commit()
    db.refresh(song)

    return _song_out(song)


@app.get("/songs", response_model=list[SongOut])
def list_songs(db: Session = Depends(get_db)) -> list[SongOut]:
    songs = db.query(Song).order_by(Song.created_at.desc()).all()
    return [_song_out(song) for song in songs]


def _song_out(song: Song) -> SongOut:
    return SongOut(
        id=song.id,
        title=song.title,
        created_at=song.created_at,
        job_status=song.job.status if song.job else "unknown",
    )
