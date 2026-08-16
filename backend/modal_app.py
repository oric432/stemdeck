"""Modal GPU function for stem separation. Deployed separately from the
FastAPI backend (`modal deploy modal_app.py`) — this file has no import
dependency on the `app` package, so it can run in Modal's isolated
container without shipping the whole backend into the image.

Requires a Modal secret named "avseparate-secrets" with: S3_ENDPOINT_URL,
S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION,
BACKEND_URL, INTERNAL_API_SECRET.
"""

import os
import pathlib
import tempfile

import modal

app = modal.App("avseparate")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    # numpy isn't reliably pulled in as a transitive dep by pip's resolver
    # even though demucs imports it directly — install explicitly.
    .pip_install("numpy>=1.26", "demucs>=4.0", "boto3>=1.35", "httpx>=0.27")
)

STEM_KINDS = ["vocals", "drums", "bass", "other"]


@app.function(
    image=image,
    gpu="T4",
    timeout=600,
    secrets=[modal.Secret.from_name("avseparate-secrets")],
)
def separate_stems(job_id: str, song_id: str, original_key: str) -> None:
    import boto3
    import httpx

    backend_url = os.environ["BACKEND_URL"].rstrip("/")
    internal_secret = os.environ["INTERNAL_API_SECRET"]
    headers = {"X-Internal-Secret": internal_secret}

    s3 = boto3.client(
        "s3",
        endpoint_url=os.environ.get("S3_ENDPOINT_URL") or None,
        aws_access_key_id=os.environ.get("S3_ACCESS_KEY_ID") or None,
        aws_secret_access_key=os.environ.get("S3_SECRET_ACCESS_KEY") or None,
        region_name=os.environ.get("S3_REGION") or "us-east-1",
    )
    bucket = os.environ["S3_BUCKET"]

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = pathlib.Path(tmpdir)
            original_path = tmp / "original"
            s3.download_file(bucket, original_key, str(original_path))

            out_dir = tmp / "separated"
            import demucs.separate

            demucs.separate.main(
                [
                    "-n",
                    "htdemucs_ft",
                    "-o",
                    str(out_dir),
                    str(original_path),
                ]
            )

            stem_dir = out_dir / "htdemucs_ft" / original_path.stem
            stems = []
            for kind in STEM_KINDS:
                stem_path = stem_dir / f"{kind}.wav"
                stem_key = f"songs/{song_id}/stems/{kind}.wav"
                s3.upload_file(str(stem_path), bucket, stem_key)
                stems.append({"kind": kind, "r2_key": stem_key})

        httpx.post(
            f"{backend_url}/internal/jobs/{job_id}/complete",
            json={"stems": stems},
            headers=headers,
            timeout=30,
        ).raise_for_status()

    except Exception as exc:
        httpx.post(
            f"{backend_url}/internal/jobs/{job_id}/fail",
            json={"error": str(exc)},
            headers=headers,
            timeout=30,
        )
        raise
