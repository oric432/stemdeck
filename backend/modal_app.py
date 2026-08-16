"""Modal GPU function for stem separation and chord detection. Deployed
separately from the FastAPI backend (`modal deploy modal_app.py`) — this
file has no import dependency on the `app` package, so it can run in
Modal's isolated container without shipping the whole backend into the
image.

Requires a Modal secret named "avseparate-secrets" with: S3_ENDPOINT_URL,
S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION,
BACKEND_URL, INTERNAL_API_SECRET.
"""

import os
import pathlib
import subprocess
import tempfile
import time
from typing import Callable, TypeVar

import modal

T = TypeVar("T")


def _retry(fn: "Callable[[], T]", attempts: int = 3, delay: float = 8.0) -> "T":
    # The free cloudflared quick tunnel MinIO/backend sit behind has no
    # uptime guarantee and drops/reconnects every so often (observed live —
    # a multi-minute job can catch one of these blips mid-transfer). A plain
    # 530 from Cloudflare isn't a botocore-recognized retryable status, so
    # this is a manual retry rather than relying on boto3's built-in one.
    last_exc: Exception | None = None
    for attempt in range(attempts):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            if attempt < attempts - 1:
                print(f"Retrying after transient error (attempt {attempt + 1}/{attempts}): {exc}")
                time.sleep(delay)
    assert last_exc is not None
    raise last_exc

app = modal.App("avseparate")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    # numpy isn't reliably pulled in as a transitive dep by pip's resolver
    # even though demucs imports it directly — install explicitly. scipy and
    # cython are build-time deps of madmom (its setup.py imports numpy), so
    # they need to land in an earlier layer than madmom itself. madmom also
    # imports pkg_resources at runtime (from setuptools) — confirmed live:
    # "No module named 'pkg_resources'" even after adding plain "setuptools"
    # here, because the later demucs/boto3/httpx layer independently pulled
    # in setuptools 84 (which dropped pkg_resources) with no pin to stop it.
    # Pin below the removal in both layers so neither can silently upgrade it.
    .pip_install("numpy>=1.26", "scipy", "cython", "setuptools<75")
    .pip_install("madmom")
    .pip_install("demucs>=4.0", "boto3>=1.35", "httpx>=0.27", "setuptools<75")
)

STEM_KINDS = ["vocals", "drums", "bass", "other"]


def _detect_chords(bass_path: pathlib.Path, other_path: pathlib.Path, tmp_dir: pathlib.Path) -> list[dict]:
    # Bass + other only (drums/vocals excluded) — cleaner chroma than the
    # full mix, reusing stems already produced by separation above.
    mixed_path = tmp_dir / "chord_mix.wav"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(bass_path),
            "-i",
            str(other_path),
            "-filter_complex",
            "amix=inputs=2:duration=longest",
            str(mixed_path),
        ],
        check=True,
        capture_output=True,
    )

    # madmom (unmaintained since ~2018) still does e.g. `from collections
    # import MutableSequence` — those aliases moved to collections.abc in
    # Python 3.3 and were removed from collections outright in 3.10. Patch
    # them back in before madmom's imports run instead of pinning an old
    # Python version just for one dependency. Confirmed live: madmom hit
    # "cannot import name 'MutableSequence' from 'collections'".
    import collections
    import collections.abc

    for name in dir(collections.abc):
        if not name.startswith("_") and not hasattr(collections, name):
            setattr(collections, name, getattr(collections.abc, name))

    # Same story with numpy: madmom uses np.float/np.int/etc, deprecated in
    # numpy 1.20 and removed in 1.24+ (we're on numpy>=1.26 for demucs).
    # Confirmed live: "module 'numpy' has no attribute 'float'". numpy's
    # module-level __getattr__ still fires a FutureWarning on the hasattr
    # probe itself for a couple of these names — silence just that.
    import warnings

    import numpy as np

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", FutureWarning)
        for np_name, builtin in [("float", float), ("int", int), ("bool", bool), ("object", object), ("complex", complex), ("str", str)]:
            if not hasattr(np, np_name):
                setattr(np, np_name, builtin)

    from madmom.audio.chroma import DeepChromaProcessor
    from madmom.features.chords import DeepChromaChordRecognitionProcessor

    chroma = DeepChromaProcessor()(str(mixed_path))
    segments = DeepChromaChordRecognitionProcessor()(chroma)

    # This decoder doesn't expose a per-segment confidence score — 1.0 is a
    # placeholder until a confidence-bearing recognizer replaces it.
    return [
        {"start_time": float(start), "end_time": float(end), "chord_label": str(label), "confidence": 1.0}
        for start, end, label in segments
    ]


@app.function(
    image=image,
    gpu="T4",
    timeout=900,
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
            _retry(lambda: s3.download_file(bucket, original_key, str(original_path)))

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
                _retry(lambda p=stem_path, k=stem_key: s3.upload_file(str(p), bucket, k))
                stems.append({"kind": kind, "r2_key": stem_key})

            # Chord detection is a Phase 2 enhancement layered on top of
            # separation, not a blocker for it — a failure here still lets
            # the song be played and mixed, just without a chord timeline.
            try:
                chords = _detect_chords(stem_dir / "bass.wav", stem_dir / "other.wav", tmp)
            except Exception as exc:
                print(f"Chord detection failed for job {job_id}: {exc}")
                chords = []

        _retry(
            lambda: httpx.post(
                f"{backend_url}/internal/jobs/{job_id}/complete",
                json={"stems": stems, "chords": chords},
                headers=headers,
                timeout=30,
            ).raise_for_status()
        )

    except Exception as exc:
        # Print the real failure before attempting the callback — if the
        # callback itself throws (e.g. BACKEND_URL unreachable), that second
        # exception would otherwise be the only thing visible in the logs,
        # masking what actually failed.
        print(f"separate_stems failed for job {job_id}: {exc}")
        try:
            httpx.post(
                f"{backend_url}/internal/jobs/{job_id}/fail",
                json={"error": str(exc)},
                headers=headers,
                timeout=30,
            )
        except Exception as callback_exc:
            print(f"Also failed to report failure for job {job_id}: {callback_exc}")
        raise
