from datetime import datetime

from pydantic import BaseModel


class SongOut(BaseModel):
    id: str
    title: str
    created_at: datetime
    job_status: str

    model_config = {"from_attributes": True}
