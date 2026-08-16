from datetime import datetime

from pydantic import BaseModel


class SongOut(BaseModel):
    id: str
    title: str
    created_at: datetime
    job_status: str

    model_config = {"from_attributes": True}


class JobOut(BaseModel):
    id: str
    song_id: str
    status: str
    error: str | None

    model_config = {"from_attributes": True}


class StemIn(BaseModel):
    kind: str
    r2_key: str


class StemOut(BaseModel):
    kind: str
    url: str


class ChordEventIn(BaseModel):
    start_time: float
    end_time: float
    chord_label: str
    confidence: float


class ChordEventOut(BaseModel):
    start_time: float
    end_time: float
    chord_label: str
    confidence: float

    model_config = {"from_attributes": True}


class JobCompleteIn(BaseModel):
    stems: list[StemIn]
    chords: list[ChordEventIn] = []


class JobFailIn(BaseModel):
    error: str
