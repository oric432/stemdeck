import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
# moto still runs boto3's real request-signing path, which needs *some*
# credentials present even though no real AWS call ever leaves the process.
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
# Force-override (not setdefault): dev's real Modal creds may already sit in
# backend/.env, and load_dotenv() (called on app.config import, after this)
# never overwrites vars already set. Without this, trigger_separation would
# actually reach real Modal during test runs.
os.environ["MODAL_TOKEN_ID"] = "test-invalid"
os.environ["MODAL_TOKEN_SECRET"] = "test-invalid"

import pytest
from fastapi.testclient import TestClient
from moto import mock_aws
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import get_db
from app.main import app
from app.models import Base


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with mock_aws(), TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
