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


class JobCompleteIn(BaseModel):
    stems: list[StemIn]


class JobFailIn(BaseModel):
    error: str
